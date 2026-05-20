import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListProducts } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useCart } from "@/contexts/CartContext";
import { useLocation } from "wouter";
import type { Product } from "@workspace/api-client-react";

const CATEGORIES = ["All", "Diapers", "Wipes", "Cream", "Essentials"] as const;
type Category = (typeof CATEGORIES)[number];

function normaliseCategory(cat: string): Category {
  const lower = cat.toLowerCase();
  if (lower.includes("diaper")) return "Diapers";
  if (lower.includes("wipe")) return "Wipes";
  if (lower.includes("cream") || lower.includes("lotion") || lower.includes("balm")) return "Cream";
  return "Essentials";
}

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`;
}

function AddedBadge({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          key="badge"
          initial={{ opacity: 0, scale: 0.8, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -4 }}
          className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm"
        >
          Added!
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { addToCart, items } = useCart();
  const [flash, setFlash] = useState(false);

  const inCart = items.find((i) => i.productId === product.id)?.quantity ?? 0;

  function handleAdd() {
    addToCart({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageEmoji: product.imageEmoji,
      imageUrl: product.imageUrl ?? null,
    });
    setFlash(true);
    setTimeout(() => setFlash(false), 1400);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 relative"
    >
      {/* Image / emoji */}
      <div className="w-full h-36 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl">{product.imageEmoji ?? "📦"}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-h-0">
        {product.brand && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
            {product.brand}
          </p>
        )}
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{product.name}</p>
        {product.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
        )}
      </div>

      {/* Price + CTA */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border">
        <div>
          <span className="text-base font-bold text-foreground">{formatPrice(product.price)}</span>
          {inCart > 0 && (
            <span className="ml-2 text-[11px] text-primary font-medium">{inCart} in cart</span>
          )}
        </div>
        <div className="relative">
          <AddedBadge show={flash} />
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity active:scale-95"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function ProductsPage() {
  const { data: products, isLoading } = useListProducts();
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [, navigate] = useLocation();
  const { totalItems } = useCart();

  const filtered = products?.filter((p) => {
    if (activeCategory === "All") return true;
    return normaliseCategory(p.category) === activeCategory;
  }) ?? [];

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-foreground">Shop</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          One-time purchases — delivered to your door.
        </p>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cart summary bar */}
      <AnimatePresence>
        {totalItems > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-5 bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3 flex items-center justify-between"
          >
            <p className="text-sm font-medium text-primary">
              {totalItems} item{totalItems !== 1 ? "s" : ""} in your cart
            </p>
            <button
              onClick={() => navigate("/cart")}
              className="text-sm font-semibold text-primary hover:underline"
            >
              View cart →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-pulse">
              <div className="h-36 bg-muted rounded-xl" />
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-8 bg-muted rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-muted-foreground">No products in this category yet.</p>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </Layout>
  );
}
