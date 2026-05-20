import { Link, useParams, useLocation } from "wouter";
import { fmtDate } from "@/lib/utils";
import {
  useGetSubscription,
  usePauseSubscription,
  useResumeSubscription,
  useDeleteSubscription,
  useUpdateSubscription,
  useGetSizeRecommendation,
  getGetSubscriptionQueryKey,
  getListSubscriptionsQueryKey,
  getGetSizeRecommendationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

interface ShippingForm {
  shippingName: string;
  shippingAddress1: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
}

export default function SubscriptionDetail() {
  const { id } = useParams<{ id: string }>();
  const subId = Number(id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: sub, isLoading } = useGetSubscription(subId, { query: { queryKey: getGetSubscriptionQueryKey(subId) } });
  const pauseSub = usePauseSubscription();
  const resumeSub = useResumeSubscription();
  const deleteSub = useDeleteSubscription();
  const updateSub = useUpdateSubscription();

  const babyId = sub?.babyId;
  const { data: sizeRec } = useGetSizeRecommendation(
    babyId ?? 0,
    { query: { queryKey: getGetSizeRecommendationQueryKey(babyId ?? 0), enabled: !!babyId } }
  );

  const [editingShipping, setEditingShipping] = useState(false);
  const [shippingForm, setShippingForm] = useState<ShippingForm>({ shippingName: "", shippingAddress1: "", shippingCity: "", shippingState: "", shippingZip: "" });
  const [shippingErrors, setShippingErrors] = useState<Partial<ShippingForm>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey(subId) });
    queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
  };

  const handlePause = () => pauseSub.mutate({ id: subId }, { onSuccess: invalidate });
  const handleResume = () => resumeSub.mutate({ id: subId }, { onSuccess: invalidate });
  const handleCancel = () => {
    if (!confirm("Cancel this subscription? This cannot be undone.")) return;
    deleteSub.mutate({ id: subId }, { onSuccess: () => navigate("/subscriptions") });
  };

  function openShippingEdit() {
    setShippingForm({
      shippingName: sub?.shippingName ?? "",
      shippingAddress1: sub?.shippingAddress1 ?? "",
      shippingCity: sub?.shippingCity ?? "",
      shippingState: sub?.shippingState ?? "",
      shippingZip: sub?.shippingZip ?? "",
    });
    setShippingErrors({});
    setEditingShipping(true);
  }

  function validateShipping() {
    const e: Partial<ShippingForm> = {};
    if (!shippingForm.shippingName) e.shippingName = "Required";
    if (!shippingForm.shippingAddress1) e.shippingAddress1 = "Required";
    if (!shippingForm.shippingCity) e.shippingCity = "Required";
    if (!shippingForm.shippingState) e.shippingState = "Required";
    if (!shippingForm.shippingZip) e.shippingZip = "Required";
    setShippingErrors(e);
    return Object.keys(e).length === 0;
  }

  function saveShipping() {
    if (!validateShipping()) return;
    updateSub.mutate({ id: subId, data: { ...shippingForm, shippingCountry: "US" } }, {
      onSuccess: () => { invalidate(); setEditingShipping(false); },
    });
  }

  if (isLoading) return (
    <Layout>
      <Skeleton className="h-48 rounded-2xl mb-4" />
      <Skeleton className="h-32 rounded-2xl" />
    </Layout>
  );

  if (!sub) return (
    <Layout>
      <div className="text-center py-20">
        <p className="text-muted-foreground">Subscription not found.</p>
        <Link href="/subscriptions"><span className="text-primary text-sm hover:underline cursor-pointer mt-2 block">Back to subscriptions</span></Link>
      </div>
    </Layout>
  );

  const hasAddress = sub.shippingName && sub.shippingAddress1;

  return (
    <Layout>
      <div className="mb-6">
        <Link href="/subscriptions">
          <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">← Back to subscriptions</span>
        </Link>
      </div>

      <div className="max-w-2xl mx-auto space-y-5">
        {/* Main details card */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-serif text-2xl font-bold text-foreground">{sub.babyName ?? "Baby"}'s subscription</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(sub.status)}`}>{sub.status}</span>
              </div>
              <p className="text-sm text-muted-foreground">Created {new Date(sub.createdAt).toLocaleDateString()}</p>
            </div>
            {sub.monthlyPriceCents && (
              <div className="text-right">
                <div className="font-bold text-xl text-foreground">${(sub.monthlyPriceCents / 100).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">/ month</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground">Current size</div>
              <div className="font-bold text-primary mt-0.5">{sizeRec?.recommendedSize ?? sub.currentDiaperSize ?? "—"}</div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground">Frequency</div>
              <div className="font-bold text-foreground mt-0.5">{formatFreq(sub.frequency ?? "")}</div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <div className="text-xs text-muted-foreground">Next delivery</div>
              <div className="font-bold text-foreground mt-0.5 text-sm">{fmtDate(sub.nextDeliveryDate)}</div>
            </div>
          </div>

          {/* Size prediction at delivery */}
          {sizeRec && (
            <div className="mb-5 bg-primary/5 border border-primary/15 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-primary uppercase tracking-wide">Smart size prediction</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{sizeRec.confidenceNote}</div>
                </div>
                {sizeRec.predictedSizeAtNextDelivery && sizeRec.predictedSizeAtNextDelivery !== sizeRec.recommendedSize ? (
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-xs text-muted-foreground">At delivery</div>
                    <div className="font-bold text-lg text-primary">{sizeRec.predictedSizeAtNextDelivery}</div>
                    {sizeRec.predictedSizeAtNextDelivery !== (sub.currentDiaperSize ?? sizeRec.recommendedSize) && (
                      <div className="text-[10px] text-amber-600 font-medium">size-up expected</div>
                    )}
                  </div>
                ) : (
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-xs text-muted-foreground">At delivery</div>
                    <div className="font-bold text-lg text-primary">{sizeRec.recommendedSize}</div>
                  </div>
                )}
              </div>
              {sizeRec.nextSize && sizeRec.estimatedMonthsInSize != null && sizeRec.estimatedMonthsInSize > 0 && (
                <div className="mt-2 pt-2 border-t border-primary/15 text-xs text-muted-foreground">
                  Sizing up to <span className="font-medium text-foreground">{sizeRec.nextSize}</span> in ~{sizeRec.estimatedMonthsInSize} month{sizeRec.estimatedMonthsInSize !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Shipping address card */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Delivery address</h2>
            {!editingShipping && (
              <button onClick={openShippingEdit} className="text-sm text-primary hover:underline font-medium">
                {hasAddress ? "Edit" : "Add address"}
              </button>
            )}
          </div>

          {editingShipping ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Full name *</label>
                <input
                  value={shippingForm.shippingName}
                  onChange={e => setShippingForm(f => ({ ...f, shippingName: e.target.value }))}
                  placeholder="Jane Smith"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {shippingErrors.shippingName && <p className="text-destructive text-xs mt-0.5">{shippingErrors.shippingName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Street address *</label>
                <input
                  value={shippingForm.shippingAddress1}
                  onChange={e => setShippingForm(f => ({ ...f, shippingAddress1: e.target.value }))}
                  placeholder="123 Main St"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {shippingErrors.shippingAddress1 && <p className="text-destructive text-xs mt-0.5">{shippingErrors.shippingAddress1}</p>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">City *</label>
                  <input
                    value={shippingForm.shippingCity}
                    onChange={e => setShippingForm(f => ({ ...f, shippingCity: e.target.value }))}
                    placeholder="Austin"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {shippingErrors.shippingCity && <p className="text-destructive text-xs mt-0.5">{shippingErrors.shippingCity}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">State *</label>
                  <input
                    value={shippingForm.shippingState}
                    onChange={e => setShippingForm(f => ({ ...f, shippingState: e.target.value }))}
                    placeholder="TX"
                    maxLength={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {shippingErrors.shippingState && <p className="text-destructive text-xs mt-0.5">{shippingErrors.shippingState}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">ZIP *</label>
                  <input
                    value={shippingForm.shippingZip}
                    onChange={e => setShippingForm(f => ({ ...f, shippingZip: e.target.value }))}
                    placeholder="78701"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {shippingErrors.shippingZip && <p className="text-destructive text-xs mt-0.5">{shippingErrors.shippingZip}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Country</label>
                  <input value="United States" disabled className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-muted-foreground text-sm" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingShipping(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted">
                  Cancel
                </button>
                <button onClick={saveShipping} disabled={updateSub.isPending} className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60">
                  {updateSub.isPending ? "Saving…" : "Save address"}
                </button>
              </div>
            </div>
          ) : hasAddress ? (
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div className="text-sm text-foreground">
                <div className="font-medium">{sub.shippingName}</div>
                <div className="text-muted-foreground">{sub.shippingAddress1}</div>
                <div className="text-muted-foreground">{sub.shippingCity}, {sub.shippingState} {sub.shippingZip}</div>
                <div className="text-muted-foreground">{sub.shippingCountry ?? "US"}</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">📦</div>
              <p className="text-sm text-muted-foreground">No shipping address yet.</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add one so orders can be sent to ShipBob automatically.</p>
              <button onClick={openShippingEdit} className="mt-3 text-sm text-primary hover:underline font-medium">Add address →</button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {sub.status === "active" && (
            <button onClick={handlePause} disabled={pauseSub.isPending}
              className="flex-1 px-4 py-2.5 border border-amber-300 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-50 disabled:opacity-60">
              Pause subscription
            </button>
          )}
          {sub.status === "paused" && (
            <button onClick={handleResume} disabled={resumeSub.isPending}
              className="flex-1 px-4 py-2.5 border border-green-300 text-green-700 rounded-xl text-sm font-medium hover:bg-green-50 disabled:opacity-60">
              Resume subscription
            </button>
          )}
          <Link href={`/babies/${sub.babyId}`} className="flex-1">
            <button className="w-full px-4 py-2.5 border border-border text-foreground rounded-xl text-sm font-medium hover:bg-muted">
              View baby profile
            </button>
          </Link>
          <button onClick={handleCancel} disabled={deleteSub.isPending}
            className="px-4 py-2.5 border border-destructive/30 text-destructive rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-60">
            Cancel
          </button>
        </div>
      </div>
    </Layout>
  );
}
