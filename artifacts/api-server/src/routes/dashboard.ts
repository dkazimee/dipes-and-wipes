import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { babiesTable, subscriptionsTable, ordersTable } from "@workspace/db";
import { eq, inArray, or, and } from "drizzle-orm";

const router = Router();

router.get("/summary", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const today = new Date().toISOString().split("T")[0];

  // Scope everything to this user's babies
  const userBabies = await db.select({ id: babiesTable.id }).from(babiesTable).where(eq(babiesTable.userId, userId));
  const babyIds = userBabies.map(b => b.id);
  const totalBabies = babyIds.length;

  const userSubs = babyIds.length > 0
    ? await db.select().from(subscriptionsTable).where(inArray(subscriptionsTable.babyId, babyIds))
    : [];
  const subIds = userSubs.map(s => s.id);
  const activeSubscriptions = userSubs.filter(s => s.status === "active").length;
  const monthlyCostCents = userSubs.filter(s => s.status === "active").reduce((sum, s) => sum + (s.monthlyPriceCents ?? 0), 0);

  let upcomingDeliveries = 0;
  let totalOrdersShipped = 0;
  let nextDelivery: { babyName: string; scheduledDate: string; diaperSize: string } | null = null;

  // Fetch both subscription orders AND one-time orders owned directly by this user
  const ordersWhere = subIds.length > 0
    ? or(inArray(ordersTable.subscriptionId, subIds), eq(ordersTable.userId, userId))
    : eq(ordersTable.userId, userId);

  const userOrders = await db.select().from(ordersTable).where(ordersWhere).orderBy(ordersTable.scheduledDate);

  upcomingDeliveries = userOrders.filter(o => o.status === "pending").length;
  totalOrdersShipped = userOrders.filter(o => o.status === "delivered").length;

  const nextOrder = userOrders.find(o => o.status === "pending");
  if (nextOrder) {
    if (nextOrder.subscriptionId) {
      const sub = userSubs.find(s => s.id === nextOrder.subscriptionId);
      if (sub?.babyId) {
        const [baby] = await db.select({ name: babiesTable.name }).from(babiesTable).where(eq(babiesTable.id, sub.babyId));
        nextDelivery = { babyName: baby?.name ?? "Baby", scheduledDate: nextOrder.scheduledDate, diaperSize: nextOrder.diaperSize ?? "Unknown" };
      }
    } else {
      // One-time order — no baby name
      nextDelivery = { babyName: "One-time order", scheduledDate: nextOrder.scheduledDate, diaperSize: nextOrder.diaperSize ?? "" };
    }
  }

  res.json({ totalBabies, activeSubscriptions, upcomingDeliveries, totalOrdersShipped, nextDelivery, monthlyCostCents: monthlyCostCents || null, sizeChangesThisYear: 0 });
});

export default router;
