import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  useListSubscriptions,
  usePauseSubscription,
  useResumeSubscription,
  useDeleteSubscription,
  getListSubscriptionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";

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

export default function Subscriptions() {
  const { data: subscriptions, isLoading } = useListSubscriptions();
  const pauseSub = usePauseSubscription();
  const resumeSub = useResumeSubscription();
  const deleteSub = useDeleteSubscription();
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });

  const handlePause = (id: number) => pauseSub.mutate({ id }, { onSuccess: invalidate });
  const handleResume = (id: number) => resumeSub.mutate({ id }, { onSuccess: invalidate });
  const handleCancel = (id: number, name: string | null) => {
    if (!confirm(`Cancel subscription for ${name ?? "baby"}?`)) return;
    deleteSub.mutate({ id }, { onSuccess: invalidate });
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Subscriptions</h1>
          <p className="text-muted-foreground mt-1">Manage your monthly deliveries</p>
        </div>
        <Link href="/subscriptions/new">
          <button className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
            New subscription
          </button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : !subscriptions?.length ? (
        <div className="text-center py-24 bg-card border border-border rounded-3xl">
          <h3 className="font-serif text-xl font-bold text-foreground mb-2">No subscriptions yet</h3>
          <p className="text-muted-foreground text-sm mb-6">Create a subscription and your diapers will arrive automatically every month.</p>
          <Link href="/subscriptions/new">
            <button className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
              Create subscription
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub, i) => (
            <motion.div
              key={sub.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Link href={`/subscriptions/${sub.id}`}>
                      <span className="font-serif text-xl font-bold text-foreground hover:text-primary transition-colors cursor-pointer">
                        {sub.babyName ?? "Baby"}'s subscription
                      </span>
                    </Link>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(sub.status)}`}>
                      {sub.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {sub.currentDiaperSize ?? "size pending"} · {formatFreq(sub.frequency ?? "")} · Next: {fmtDate(sub.nextDeliveryDate)}
                  </p>
                </div>
                {sub.monthlyPriceCents && (
                  <div className="text-right">
                    <div className="font-bold text-foreground">${(sub.monthlyPriceCents / 100).toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">/ month</div>
                  </div>
                )}
              </div>

              {sub.items && sub.items.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {sub.items.map((item) => (
                    <span key={item.productId} className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-lg">
                      {item.productName ?? `Product ${item.productId}`} ×{item.quantity}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-border">
                <Link href={`/subscriptions/${sub.id}`}>
                  <button className="text-sm px-4 py-1.5 border border-border rounded-lg text-foreground hover:bg-muted">
                    View details
                  </button>
                </Link>
                {sub.status === "active" && (
                  <button
                    onClick={() => handlePause(sub.id)}
                    className="text-sm px-4 py-1.5 border border-border rounded-lg text-amber-700 hover:bg-amber-50"
                  >
                    Pause
                  </button>
                )}
                {sub.status === "paused" && (
                  <button
                    onClick={() => handleResume(sub.id)}
                    className="text-sm px-4 py-1.5 border border-border rounded-lg text-green-700 hover:bg-green-50"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => handleCancel(sub.id, sub.babyName ?? null)}
                  className="text-sm px-4 py-1.5 border border-border rounded-lg text-destructive hover:bg-red-50 ml-auto"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Layout>
  );
}
