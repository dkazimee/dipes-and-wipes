import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "./layout";
import { fmtDate } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "OnTrac", "Other"];

type OrderItem = {
  productId: number;
  productName: string;
  quantity: number;
  priceCents: number | null;
};

type FulfillmentOrder = {
  id: number;
  subscriptionId: number | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  babyId: number | null;
  babyName: string | null;
  status: string;
  scheduledDate: string;
  diaperSize: string | null;
  totalCents: number | null;
  trackingNumber: string | null;
  carrier: string | null;
  fulfillmentProvider: string | null;
  fulfillmentId: string | null;
  fulfillmentStatus: string | null;
  fulfillmentErrorMessage: string | null;
  shippingName: string | null;
  shippingAddress1: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  createdAt: string;
  items: OrderItem[];
};

async function fetchFulfillmentOrders(): Promise<FulfillmentOrder[]> {
  const res = await fetch(`${BASE}/api/admin/fulfillment/orders`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load fulfillment orders");
  return res.json();
}

async function shipOrder(id: number, data: { trackingNumber: string; carrier: string }): Promise<FulfillmentOrder> {
  const res = await fetch(`${BASE}/api/admin/orders/${id}/ship`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to update order");
  }
  return res.json();
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-teal-100 text-teal-700",
  delivered: "bg-green-100 text-green-700",
  fulfillment_error: "bg-red-100 text-red-700",
  exception: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Needs action" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

function needsAction(o: FulfillmentOrder) {
  return o.status === "pending" || o.status === "fulfillment_error";
}

function TrackingForm({ order, onSuccess }: { order: FulfillmentOrder; onSuccess: () => void }) {
  const [carrier, setCarrier] = useState(order.carrier ?? "USPS");
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => shipOrder(order.id, { trackingNumber: trackingNumber.trim(), carrier }),
    onSuccess: () => { setError(null); onSuccess(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="pt-3 border-t border-border mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Carrier</label>
            <select
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {CARRIERS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Tracking number</label>
            <input
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="1Z999AA10123456784"
              className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
            />
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !trackingNumber.trim()}
          className="w-full bg-primary text-primary-foreground text-sm font-semibold py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {mutation.isPending ? "Saving…" : "Mark as shipped & notify customer"}
        </button>
      </div>
    </motion.div>
  );
}

function OrderCard({ order }: { order: FulfillmentOrder }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();
  const isActionable = needsAction(order);
  const isShipped = order.status === "shipped";

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/admin/orders/${order.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to delete order");
      }
    },
    onSuccess: () => {
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ["admin-fulfillment-orders"] });
    },
  });

  return (
    <div className={`bg-card border rounded-2xl p-4 ${order.status === "fulfillment_error" ? "border-red-200" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground">#{order.id}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? "bg-muted text-muted-foreground"}`}>
            {order.status.replace("_", " ")}
          </span>
          {order.subscriptionId && (
            <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">subscription</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">{fmtDate(order.scheduledDate)}</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mb-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            {order.userName ?? order.userEmail ?? "Unknown customer"}
          </p>
          {order.userName && order.userEmail && (
            <p className="text-xs text-muted-foreground">{order.userEmail}</p>
          )}
          {order.babyName && (
            <p className="text-xs text-muted-foreground mt-0.5">Baby: {order.babyName}{order.diaperSize ? ` · ${order.diaperSize}` : ""}</p>
          )}
          {!order.babyName && order.diaperSize && (
            <p className="text-xs text-muted-foreground mt-0.5">{order.diaperSize}</p>
          )}
          {order.totalCents != null && (
            <p className="text-xs font-semibold text-foreground mt-0.5">${(order.totalCents / 100).toFixed(2)}</p>
          )}
        </div>
        {(order.shippingName || order.shippingAddress1) && (
          <div className="text-xs text-muted-foreground leading-relaxed">
            {order.shippingName && <p className="font-medium text-foreground">{order.shippingName}</p>}
            {order.shippingAddress1 && <p>{order.shippingAddress1}</p>}
            {order.shippingCity && <p>{order.shippingCity}{order.shippingState ? `, ${order.shippingState}` : ""} {order.shippingZip ?? ""}</p>}
          </div>
        )}
      </div>

      {order.items.length > 0 && (
        <div className="bg-muted/40 rounded-xl px-3 py-2 mb-2 space-y-1">
          {order.items.map(item => (
            <div key={item.productId} className="flex items-center justify-between gap-2">
              <span className="text-xs text-foreground truncate">{item.productName}</span>
              <span className="text-xs font-semibold text-foreground flex-shrink-0 tabular-nums">
                × {item.quantity}
              </span>
            </div>
          ))}
        </div>
      )}

      {order.fulfillmentErrorMessage && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">
          ⚠ {order.fulfillmentErrorMessage}
        </p>
      )}

      {(isShipped || order.status === "delivered") && order.trackingNumber && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 mb-2">
          <span className="font-medium text-foreground">{order.carrier ?? "Carrier"}</span>
          <span>·</span>
          <span className="font-mono">{order.trackingNumber}</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        {isActionable ? (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {expanded ? "Cancel" : (order.trackingNumber ? "Update tracking" : "Add tracking & ship ↓")}
          </button>
        ) : <span />}

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Remove this order?</span>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {deleteMutation.isError && (
        <p className="text-xs text-destructive mt-1">{deleteMutation.error?.message}</p>
      )}

      <AnimatePresence>
        {expanded && (
          <TrackingForm
            key="form"
            order={order}
            onSuccess={() => {
              setExpanded(false);
              qc.invalidateQueries({ queryKey: ["admin-fulfillment-orders"] });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminFulfillment() {
  const [filter, setFilter] = useState<"all" | "needs_action" | "shipped" | "delivered">("needs_action");
  const { data: orders, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-fulfillment-orders"],
    queryFn: fetchFulfillmentOrders,
    refetchInterval: 60_000,
  });

  const needsActionCount = orders?.filter(needsAction).length ?? 0;

  const filtered = (orders ?? []).filter(o => {
    if (filter === "needs_action") return needsAction(o);
    if (filter === "shipped") return o.status === "shipped" || o.status === "processing";
    if (filter === "delivered") return o.status === "delivered";
    return true;
  });

  return (
    <AdminLayout>
      {/* Alert banner */}
      <AnimatePresence>
        {needsActionCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 mb-6"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              <strong>{needsActionCount}</strong> order{needsActionCount !== 1 ? "s" : ""} need{needsActionCount === 1 ? "s" : ""} fulfillment
            </p>
            <button
              onClick={() => setFilter("needs_action")}
              className="ml-auto text-xs text-amber-700 font-semibold hover:underline"
            >
              View
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-2xl font-bold text-foreground">Order fulfillment</h2>
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as typeof filter)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.key === "needs_action" && needsActionCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {needsActionCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          Failed to load orders. Try refreshing.
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium text-foreground">
            {filter === "needs_action" ? "All caught up!" : "No orders here"}
          </p>
          <p className="text-sm mt-1">
            {filter === "needs_action" ? "No pending orders need attention right now." : "Try a different filter."}
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(order => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
