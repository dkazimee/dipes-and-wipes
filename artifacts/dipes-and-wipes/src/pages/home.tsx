import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useUser } from "@clerk/react";

const steps = [
  { step: "01", title: "Add your baby", desc: "Enter your baby's name, birthdate, and current weight and height percentiles from their pediatrician." },
  { step: "02", title: "We pick the right size", desc: "Our size engine calculates the perfect diaper size based on weight ranges and adjusts automatically as your baby grows." },
  { step: "03", title: "Monthly delivery", desc: "Diapers, wipes, and essentials arrive at your door every month. No remembering. No running out. No wrong sizes." },
  { step: "04", title: "We grow with them", desc: "As your baby hits new growth milestones, we size up automatically. You'll never buy diapers that are too small again." },
];

const features = [
  { title: "Smart sizing", desc: "Based on your baby's actual weight and CDC growth percentiles — not just age guesswork." },
  { title: "Auto size-up", desc: "We track growth entries and automatically size up when it's time. No action needed from you." },
  { title: "Curated products", desc: "Trusted brands like Pampers and Huggies, plus wipes, creams, and essential items in every box." },
  { title: "Pause anytime", desc: "Life happens. Pause, skip, or cancel your subscription any time — no questions asked." },
  { title: "Delivery tracking", desc: "Know exactly when your next box arrives and what size will be inside, weeks in advance." },
  { title: "Growth history", desc: "Log every weight check and see your baby's journey. All in one place." },
];

export default function Home() {
  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();

  function handleAddBaby() {
    navigate(isSignedIn ? "/babies/new" : "/sign-up");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <img src="/logo.png" alt="Dipes & Wipes" className="h-14 w-auto" />
            <div className="flex items-center gap-3">
              <Link href="/sign-in">
                <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                  Sign in
                </span>
              </Link>
              <Link href="/sign-up">
                <button className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
                  Get started
                </button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-20">
            {/* Hero visual */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="flex justify-center mb-2"
          >
            <img
              src="/images/hero-logo.png"
              alt="Dipes & Wipes — The right fit, delivered"
              className="w-full max-w-xl"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="inline-block bg-accent text-accent-foreground text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              Smart subscriptions for growing babies
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl font-bold text-foreground leading-tight mb-6">
              The right diaper size,<br />every single month.
            </h1>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
              Upload your baby's growth percentiles and we handle the rest. Diapers that fit perfectly, delivered automatically — and sized up the moment they need it.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={handleAddBaby}
                className="bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-medium text-base hover:opacity-90 transition-opacity w-full sm:w-auto"
              >
                Add your baby — it's free
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/50 py-20 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl font-bold text-center text-foreground mb-12">How it works</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-card rounded-2xl p-6 border border-border"
              >
                <div className="font-serif text-4xl font-bold text-primary/30 mb-3">{step.step}</div>
                <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl font-bold text-center text-foreground mb-4">Built for exhausted parents</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            You have enough to think about. Diapers shouldn't be one of them.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ delay: i * 0.08 }}
                viewport={{ once: true }}
                className="p-6 rounded-2xl bg-card border border-border hover:shadow-md transition-shadow"
              >
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="font-serif text-lg font-bold text-primary">Dipes & Wipes</span>
          <p className="text-xs text-muted-foreground mt-2">The smart subscription for growing babies.</p>
        </div>
      </footer>
    </div>
  );
}
