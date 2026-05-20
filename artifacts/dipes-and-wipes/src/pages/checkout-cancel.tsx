import { Link, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { motion } from "framer-motion";

export default function CheckoutCancel() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const subscriptionId = params.get("subscription_id");

  return (
    <Layout>
      <div className="max-w-lg mx-auto py-16 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6"
        >
          <svg className="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <h1 className="font-serif text-3xl font-bold text-foreground mb-3">
            Payment cancelled
          </h1>
          <p className="text-muted-foreground mb-8">
            No worries — nothing was charged. Your subscription has been saved and you can complete payment any time.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {subscriptionId && (
              <Link href={`/subscriptions/${subscriptionId}`}>
                <button className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                  Back to subscription
                </button>
              </Link>
            )}
            <Link href="/subscriptions">
              <button className="w-full sm:w-auto px-6 py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors">
                View all subscriptions
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
