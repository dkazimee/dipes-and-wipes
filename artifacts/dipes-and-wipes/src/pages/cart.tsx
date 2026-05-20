import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout";
import { useCart } from "@/contexts/CartContext";

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CartPage() {
  const { items, totalItems, totalCents, removeFromCart, updateQuantity, clearCart } = useCart();
  const [, navigate] = useLocation();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (items.length === 0) return;
    setIsCheckingOut(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout/one-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Checkout failed");
      }
      const { url } = await res.json() as { url: string };
      if (url) {
        clearCart();
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsCheckingOut(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-serif">Your cart</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalItems === 0 ? "Empty" : `${totalItems} item${totalItems !== 1 ? "s" : ""}`}
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🛒</div>
            <p className="text-muted-foreground mb-6">Your cart is empty.</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Browse products
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.div
                    key={item.productId}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0, padding: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-card border border-border rounded-2xl px-4 py-4 flex items-center gap-4"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-10 h-10 object-contain rounded-lg" />
                      ) : (
                        <span className="text-2xl">{item.imageEmoji ?? "📦"}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatPrice(Math.round(item.price * 100))} each
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors text-sm font-medium"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-medium text-foreground tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors text-sm font-medium"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {formatPrice(Math.round(item.price * 100) * item.quantity)}
                      </p>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-[11px] text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                      >
                        Remove
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Summary */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="text-sm font-medium text-foreground">{formatPrice(totalCents)}</span>
              </div>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <span className="text-sm text-muted-foreground">Shipping</span>
                <span className="text-sm text-muted-foreground">Calculated at checkout</span>
              </div>
              <div className="flex items-center justify-between mb-5">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-bold text-lg text-foreground">{formatPrice(totalCents)}</span>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isCheckingOut ? "Redirecting to payment…" : `Pay ${formatPrice(totalCents)} →`}
              </button>

              <p className="text-xs text-center text-muted-foreground mt-3">
                Secure payment via Stripe. Your card is never stored on our servers.
              </p>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
