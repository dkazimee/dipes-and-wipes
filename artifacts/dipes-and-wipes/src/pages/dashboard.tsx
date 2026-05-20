import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  useGetDashboardSummary,
  useListSubscriptions,
  useListOrders,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";
import { fmtDate } from "@/lib/utils";

function formatFreq(freq: string): string {
  const days = Number(freq);
  if (!isNaN(days) && days > 0) {
    if (days % 30 === 0) { const m = days / 30; return m === 1 ? "every month" : `every ${m} months`; }
    if (days % 7  === 0) { const w = days / 7;  return w === 1 ? "every week" : `every ${w} weeks`; }
    return `every ${days} days`;
  }
  if (freq === "biweekly") return "every 2 weeks";
  if (freq === "bimonthly") return "every 2 months";
  return "monthly";
}

function statusColor(status: string) {
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "paused") return "bg-amber-100 text-amber-700";
  if (status === "cancelled") return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

function orderStatusColor(status: string) {
  if (status === "delivered") return "bg-green-100 text-green-700";
  if (status === "shipped") return "bg-blue-100 text-blue-700";
  if (status === "pending") return "bg-amber-100 text-amber-700";
  return "bg-muted text-muted-foreground";
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: subscriptions } = useListSubscriptions();
  const { data: orders } = useListOrders();

  const upcomingOrders = orders?.filter((o) => o.status === "pending").slice(0, 3) ?? [];
  const recentOrders = orders?.filter((o) => o.status !== "pending").slice(-3).reverse() ?? [];

  const stats = summary
    ? [
        { label: "Babies tracked", value: summary.totalBabies, href: "/babies" },
        { label: "Active subscriptions", value: summary.activeSubscriptions, href: "/subscriptions" },
        { label: "Upcoming deliveries", value: summary.upcomingDeliveries, href: "/orders" },
        { label: "Orders shipped", value: summary.totalOrdersShipped, href: "/orders" },
      ]
    : [];

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Everything at a glance</p>
      </div>

      {/* Next delivery callout */}
      {summary?.nextDelivery && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 bg-primary/10 border border-primary/20 rounded-2xl p-5 flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-medium text-primary uppercase tracking-wide mb-1">Next delivery</div>
            <div className="font-semibold text-foreground text-lg">
              {summary.nextDelivery.babyName}'s box — {summary.nextDelivery.diaperSize}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {fmtDate(summary.nextDelivery.scheduledDate)}
            </div>
          </div>
          <Link href="/orders">
            <button className="text-sm font-medium text-primary hover:underline">View orders</button>
          </Link>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {summaryLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))
          : stats.map((stat, i) => (
              <Link key={stat.label} href={stat.href}>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="text-3xl font-bold font-serif text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
                </motion.div>
              </Link>
            ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Active subscriptions */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Active subscriptions</h2>
            <Link href="/subscriptions">
              <span className="text-sm text-primary hover:underline cursor-pointer">See all</span>
            </Link>
          </div>
          {!subscriptions ? (
            <div className="space-y-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm mb-3">No subscriptions yet</p>
              <Link href="/subscriptions/new">
                <button className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium">
                  Create one
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions.slice(0, 4).map((sub) => (
                <div key={sub.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/babies/${sub.babyId}`}>
                        <span className="font-medium text-sm text-foreground hover:text-primary cursor-pointer transition-colors">
                          {sub.babyName ?? "Baby"}
                        </span>
                      </Link>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {sub.currentDiaperSize} · {formatFreq(sub.frequency ?? "")} · next {fmtDate(sub.nextDeliveryDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(sub.status)}`}>
                      {sub.status}
                    </span>
                    <Link href={`/subscriptions/${sub.id}`}>
                      <span className="text-xs text-primary hover:underline cursor-pointer">View</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming + recent orders */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Recent orders</h2>
            <Link href="/orders">
              <span className="text-sm text-primary hover:underline cursor-pointer">See all</span>
            </Link>
          </div>
          {!orders ? (
            <div className="space-y-3">
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ) : [...upcomingOrders, ...recentOrders].length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {[...upcomingOrders, ...recentOrders].slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {order.babyName ?? "Baby"} — {order.diaperSize}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(order.scheduledDate)}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${orderStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monthly spend */}
      {summary?.monthlyCostCents ? (
        <div className="mt-6 bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Monthly spend</div>
            <div className="font-serif text-2xl font-bold text-foreground mt-0.5">
              ${(summary.monthlyCostCents / 100).toFixed(2)}
            </div>
          </div>
          <Link href="/subscriptions/new">
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90">
              Add baby
            </button>
          </Link>
        </div>
      ) : null}
    </Layout>
  );
}
