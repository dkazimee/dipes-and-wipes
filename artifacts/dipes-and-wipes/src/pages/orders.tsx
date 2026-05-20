import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListOrders, type Order } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";
import { fmtDate } from "@/lib/utils";

const CARRIER_TRACKING_URLS: Record<string, (n: string) => string> = {
  USPS:   n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  UPS:    n => `https://www.ups.com/track?tracknum=${n}`,
  FedEx:  n => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  DHL:    n => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`,
  OnTrac: n => `https://www.ontrac.com/tracking/?number=${n}`,
};

function trackingUrl(carrier: string | null | undefined, trackingNumber: string) {
  if (!carrier) return `https://www.google.com/search?q=tracking+${encodeURIComponent(trackingNumber)}`;
  const builder = CARRIER_TRACKING_URLS[carrier];
  return builder ? builder(trackingNumber) : `https://www.google.com/search?q=${encodeURIComponent(carrier)}+tracking+${encodeURIComponent(trackingNumber)}`;
}

function statusColor(status: string) {
  if (status === "delivered")        return "bg-green-100 text-green-700";
  if (status === "shipped")          return "bg-teal-100 text-teal-700";
  if (status === "processing")       return "bg-blue-100 text-blue-700";
  if (status === "pending")          return "bg-amber-100 text-amber-700";
  if (status === "fulfillment_error") return "bg-red-100 text-red-700";
  if (status === "exception")        return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

function statusLabel(status: string) {
  if (status === "delivered")        return "Delivered";
  if (status === "shipped")          return "Shipped";
  if (status === "processing")       return "Processing";
  if (status === "pending")          return "Upcoming";
  if (status === "fulfillment_error") return "Delayed";
  if (status === "exception")        return "Exception";
  return status;
}

function statusIcon(status: string) {
  if (status === "delivered") return "✓";
  if (status === "shipped")   return "📦";
  if (status === "processing") return "⚙";
  if (status === "pending")   return "🕐";
  return "·";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const hasTracking = !!order.trackingNumber;
  const isShipped = order.status === "shipped" || order.status === "delivered";

  return (
    <div
      className={`bg-card border rounded-2xl overflow-hidden transition-shadow ${
        open ? "border-primary/30 shadow-sm" : "border-border"
      }`}
    >
      {/* Clickable summary row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl leading-none flex-shrink-0">{statusIcon(order.status)}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground truncate">
                {order.babyName ? `${order.babyName}'s box` : "One-time order"}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor(order.status)}`}>
                {statusLabel(order.status)}
              </span>
              {hasTracking && !open && (
                <span className="text-xs text-teal-600 font-medium flex-shrink-0">Tracking available</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {order.diaperSize ? `${order.diaperSize} · ` : ""}
              {order.status === "pending" ? `Ships ${fmtDate(order.scheduledDate)}` : fmtDate(order.scheduledDate)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {order.totalCents != null && (
            <span className="font-bold text-foreground">${(order.totalCents / 100).toFixed(2)}</span>
          )}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-muted-foreground text-sm"
          >
            ▾
          </motion.span>
        </div>
      </button>

      {/* Expandable detail panel */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-border/60 pt-4 space-y-4">

              {/* Order info */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Order details</p>
                <div>
                  <Row label="Order #" value={`#${order.id}`} />
                  <Row label="Date placed" value={fmtDate(order.createdAt)} />
                  <Row label="Ship date" value={fmtDate(order.scheduledDate)} />
                  {order.diaperSize && <Row label="Diaper size" value={order.diaperSize} />}
                  {order.totalCents != null && (
                    <Row label="Total" value={<span className="font-semibold">${(order.totalCents / 100).toFixed(2)}</span>} />
                  )}
                </div>
              </div>

              {/* Shipping address */}
              {order.shippingName && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ship to</p>
                  <div className="text-sm text-foreground leading-relaxed">
                    <p className="font-medium">{order.shippingName}</p>
                    {order.shippingAddress1 && <p className="text-muted-foreground">{order.shippingAddress1}</p>}
                    {order.shippingCity && (
                      <p className="text-muted-foreground">
                        {order.shippingCity}{order.shippingState ? `, ${order.shippingState}` : ""} {order.shippingZip ?? ""}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Tracking */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tracking</p>
                {hasTracking ? (
                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {order.carrier && (
                          <p className="text-xs text-teal-600 font-semibold uppercase tracking-wider mb-1">{order.carrier}</p>
                        )}
                        <p className="font-mono text-sm font-semibold text-foreground break-all">{order.trackingNumber}</p>
                        {order.fulfillmentStatus && (
                          <p className="text-xs text-muted-foreground mt-1 capitalize">{order.fulfillmentStatus.replace(/_/g, " ")}</p>
                        )}
                      </div>
                      <a
                        href={trackingUrl(order.carrier, order.trackingNumber!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 bg-teal-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                      >
                        Track →
                      </a>
                    </div>
                  </div>
                ) : isShipped ? (
                  <p className="text-sm text-muted-foreground">Tracking information not yet available.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {order.status === "pending"
                      ? "Tracking will appear here once your order ships."
                      : "No tracking information available."}
                  </p>
                )}
              </div>

              {/* Fulfillment error */}
              {order.fulfillmentErrorMessage && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-red-600 mb-0.5">Fulfillment issue</p>
                  <p className="text-sm text-red-700">{order.fulfillmentErrorMessage}</p>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, orders }: { title: string; orders: Order[] }) {
  if (!orders.length) return null;
  return (
    <div>
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">
        {title} ({orders.length})
      </h2>
      <div className="space-y-3">
        {orders.map((order, i) => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <OrderCard order={order} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function Orders() {
  const { data: orders, isLoading } = useListOrders();

  const upcoming = orders?.filter(o => o.status === "pending" || o.status === "fulfillment_error") ?? [];
  const active   = orders?.filter(o => o.status === "processing" || o.status === "shipped") ?? [];
  const past     = [...(orders?.filter(o => o.status === "delivered" || o.status === "exception") ?? [])].reverse();

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground">Delivery orders</h1>
        <p className="text-muted-foreground mt-1">Tap any order to see details and tracking</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : !orders?.length ? (
        <div className="text-center py-24 bg-card border border-border rounded-3xl">
          <p className="text-4xl mb-3">📦</p>
          <h3 className="font-serif text-xl font-bold text-foreground mb-2">No orders yet</h3>
          <p className="text-muted-foreground text-sm">Orders appear here once you have an active subscription or place a one-time purchase.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section title="Upcoming" orders={upcoming} />
          <Section title="In transit" orders={active} />
          <Section title="Delivery history" orders={past} />
        </div>
      )}
    </Layout>
  );
}
