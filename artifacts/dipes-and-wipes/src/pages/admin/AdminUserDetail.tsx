import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AdminUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  banned: boolean;
};

type AdminBaby = {
  id: number;
  name: string;
  birthDate: string;
  currentDiaperSize: string | null;
  currentWeightLbs: number | null;
  avatarEmoji: string | null;
  gender: string | null;
};

type AdminOrder = {
  id: number;
  subscriptionId: number;
  babyId: number;
  babyName: string;
  status: string;
  scheduledDate: string;
  diaperSize: string | null;
  totalCents: number | null;
  trackingNumber: string | null;
  fulfillmentStatus: string | null;
  fulfillmentErrorMessage: string | null;
  createdAt: string;
};

type UserDetails = { babies: AdminBaby[]; orders: AdminOrder[] };

type StripePayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  description: string | null;
};

async function fetchUserDetails(userId: string): Promise<UserDetails> {
  const res = await fetch(`${BASE}/api/admin/users/${userId}/details`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load user details");
  return res.json();
}

async function fetchPayments(userId: string): Promise<StripePayment[]> {
  const res = await fetch(`${BASE}/api/stripe/payments/${userId}`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

async function issueRefund(paymentIntentId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/stripe/refund`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentIntentId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? "Refund failed");
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ageLabel(birthDate: string) {
  const now = new Date();
  const birth = new Date(birthDate);
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 1) return "< 1 month";
  if (months < 24) return `${months} mo`;
  return `${Math.floor(months / 12)} yr ${months % 12} mo`;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  shipped: "bg-teal-50 text-teal-700 border-teal-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-muted text-muted-foreground border-border",
  failed: "bg-red-50 text-red-700 border-red-200",
  fulfillment_error: "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function UserAvatar({ user }: { user: AdminUser }) {
  const initials = user.firstName
    ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ""}`.toUpperCase()
    : (user.email?.[0]?.toUpperCase() ?? "?");
  return user.imageUrl ? (
    <img src={user.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-border flex-shrink-0" />
  ) : (
    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

interface Props {
  user: AdminUser;
  onClose: () => void;
}

export function AdminUserDetail({ user, onClose }: Props) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user-details", user.id],
    queryFn: () => fetchUserDetails(user.id),
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["admin-payments", user.id],
    queryFn: () => fetchPayments(user.id),
  });

  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundErrors, setRefundErrors] = useState<Record<string, string>>({});

  const refundMutation = useMutation({
    mutationFn: (paymentIntentId: string) => issueRefund(paymentIntentId),
    onMutate: (id) => setRefundingId(id),
    onSuccess: () => {
      setRefundingId(null);
      qc.invalidateQueries({ queryKey: ["admin-payments", user.id] });
    },
    onError: (err, id) => {
      setRefundingId(null);
      setRefundErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Refund failed",
      }));
    },
  });

  const displayName = user.firstName || user.lastName
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : user.email ?? "Unknown";

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        key="panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors mr-1"
            aria-label="Close"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <UserAvatar user={user} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{displayName}</p>
            {(user.firstName || user.lastName) && (
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            )}
          </div>
          {user.banned && (
            <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              Banned
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex gap-4 px-5 py-3 border-b border-border text-xs text-muted-foreground flex-shrink-0">
          <span>Joined {formatDate(user.createdAt)}</span>
          <span className="text-border">·</span>
          <span>Last sign in {formatDate(user.lastSignInAt)}</span>
          <span className="text-border">·</span>
          <span className="font-mono text-[10px] opacity-60 truncate">{user.id}</span>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-5 w-24 rounded-lg" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-5 w-24 rounded-lg mt-4" />
              <Skeleton className="h-14 rounded-2xl" />
              <Skeleton className="h-14 rounded-2xl" />
              <Skeleton className="h-14 rounded-2xl" />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              Failed to load details. Try closing and reopening.
            </div>
          )}

          {data && (
            <>
              {/* Babies */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Babies ({data.babies.length})
                </h3>
                {data.babies.length === 0 ? (
                  <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
                    No babies added yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.babies.map((baby) => (
                      <div
                        key={baby.id}
                        className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3"
                      >
                        <span className="text-2xl flex-shrink-0">{baby.avatarEmoji ?? "👶"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{baby.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ageLabel(baby.birthDate)}
                            {baby.currentWeightLbs != null && ` · ${baby.currentWeightLbs} lbs`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {baby.currentDiaperSize ? (
                            <span className="text-xs font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                              {baby.currentDiaperSize}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No size</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Orders */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Orders ({data.orders.length})
                </h3>
                {data.orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
                    No orders yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.orders.map((order) => (
                      <div
                        key={order.id}
                        className="bg-card border border-border rounded-xl px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">#{order.id}</span>
                            <StatusBadge status={order.status} />
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatDate(order.scheduledDate)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">
                          {order.babyName}
                          {order.diaperSize && (
                            <span className="text-muted-foreground"> · {order.diaperSize}</span>
                          )}
                        </p>
                        {order.totalCents != null && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ${(order.totalCents / 100).toFixed(2)}
                          </p>
                        )}
                        {order.trackingNumber && (
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                            Tracking: {order.trackingNumber}
                          </p>
                        )}
                        {order.fulfillmentErrorMessage && (
                          <p className="text-xs text-red-600 mt-1 bg-red-50 rounded-lg px-2 py-1">
                            {order.fulfillmentErrorMessage}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Payments */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Payments
                </h3>
                {paymentsLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-14 rounded-xl" />
                    <Skeleton className="h-14 rounded-xl" />
                  </div>
                )}
                {!paymentsLoading && (!payments || payments.length === 0) && (
                  <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
                    No Stripe payments found.
                  </p>
                )}
                {payments && payments.length > 0 && (
                  <div className="space-y-2">
                    {payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="bg-card border border-border rounded-xl px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              ${(payment.amount / 100).toFixed(2)} {payment.currency.toUpperCase()}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                              payment.status === "succeeded"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : payment.status === "requires_payment_method"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-muted text-muted-foreground border-border"
                            }`}>
                              {payment.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {new Date(payment.created * 1000).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                          </span>
                        </div>
                        {payment.description && (
                          <p className="text-xs text-muted-foreground mb-2">{payment.description}</p>
                        )}
                        <p className="text-[10px] font-mono text-muted-foreground/60 mb-2">{payment.id}</p>
                        {refundErrors[payment.id] && (
                          <p className="text-xs text-red-600 mb-2">{refundErrors[payment.id]}</p>
                        )}
                        {payment.status === "succeeded" && (
                          <button
                            onClick={() => refundMutation.mutate(payment.id)}
                            disabled={refundingId === payment.id}
                            className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                          >
                            {refundingId === payment.id ? "Processing…" : "Issue full refund"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
