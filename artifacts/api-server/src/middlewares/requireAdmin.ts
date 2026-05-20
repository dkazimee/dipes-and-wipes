import { getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

const ADMIN_EMAIL = "dkazimee@gmail.com";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await clerkClient.users.getUser(userId);
  const email = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress;

  if (email !== ADMIN_EMAIL) return res.status(403).json({ error: "Forbidden" });
  next();
}
