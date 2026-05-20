import { Link, useLocation } from "wouter";
import { fmtDate } from "@/lib/utils";
import {
  useListBabies,
  useCreateSubscription,
  useCreateSubscriptionCheckout,
  useGetDiapersRecommendation,
  getGetDiapersRecommendationQueryKey,
  getListSubscriptionsQueryKey,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout";

/** Preset delivery frequency options (stored as days). */
const FREQ_OPTIONS = [
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
];

/** Multiplier relative to one calendar month (30.44 days). */
function freqMultiplier(days: number) { return days / 30.44; }

/** Return exact human unit: months if ÷30, weeks if ÷7, else days. */
function freqUnit(days: number): { value: number; unit: "month" | "week" | "day" } {
  if (days % 30 === 0) return { value: days / 30, unit: "month" };
  if (days % 7  === 0) return { value: days / 7,  unit: "week"  };
  return { value: days, unit: "day" };
}

/** "every 2 weeks", "every month", "every 6 weeks", … */
function freqRateLabel(days: number): string {
  const { value, unit } = freqUnit(days);
  if (value === 1) return `every ${unit}`;
  return `every ${value} ${unit}s`;
}

/** Short suffix for prices: "2 weeks", "month", "6 weeks", … */
function freqPeriodLabel(days: number): string {
  const { value, unit } = freqUnit(days);
  if (value === 1) return unit;
  return `${value} ${unit}s`;
}

/** Capitalised label for display: "Every 2 weeks", "Every month", … */
function freqDisplayLabel(days: number): string {
  const { value, unit } = freqUnit(days);
  if (value === 1) return `Every ${unit}`;
  return `Every ${value} ${unit}s`;
}

// Tier metadata keyed by brand name
const DIAPER_TIERS: Record<string, { tier: string; tagline: string; color: string; bg: string }> = {
  "Luvs": {
    tier: "Budget",
    tagline: "Trusted leak protection without the premium price tag. Reliable coverage for families watching their budget.",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
  },
  "Huggies": {
    tier: "Mid-range",
    tagline: "America's most trusted diaper brand. Pocketed waistband and soft outer cover for all-day comfort.",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  "Pampers": {
    tier: "Premium",
    tagline: "The #1 hospital-recommended brand. Ultra-soft with wetness indicator so you always know it's time for a change.",
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200",
  },
  "The Honest Company": {
    tier: "Luxury",
    tagline: "Plant-based liner, no harsh chemicals, adorable prints. Eco-conscious diapers for health-minded parents.",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
};

// Preferred sort order for diaper brand cards
const DIAPER_BRAND_ORDER = ["Luvs", "Huggies", "Pampers", "The Honest Company"];

type Step = "details" | "diapers" | "shipping" | "review";

const steps: { key: Step; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "diapers", label: "Diapers" },
  { key: "shipping", label: "Shipping" },
  { key: "review", label: "Review" },
];

interface ShippingForm {
  shippingName: string;
  shippingAddress1: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
}

export default function NewSubscription() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: babies } = useListBabies();
  const createSub = useCreateSubscription();
  const createCheckout = useCreateSubscriptionCheckout();

  const [step, setStep] = useState<Step>("details");
  const [babyId, setBabyId] = useState<string>("");
  const [frequency, setFrequency] = useState<number>(30);
  const [nextDeliveryDate, setNextDeliveryDate] = useState<string>("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [shipping, setShipping] = useState<ShippingForm>({
    shippingName: "", shippingAddress1: "", shippingCity: "", shippingState: "", shippingZip: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const numBabyId = babyId ? Number(babyId) : null;

  const { data: diapersRec } = useGetDiapersRecommendation(
    numBabyId ?? 0,
    { query: { enabled: !!numBabyId, queryKey: getGetDiapersRecommendationQueryKey(numBabyId ?? 0) } }
  );

  const selectedBaby = babies?.find(b => b.id === Number(babyId));

  const oneWeekOut = new Date();
  oneWeekOut.setDate(oneWeekOut.getDate() + 7);
  const minDate = oneWeekOut.toISOString().split("T")[0];

  function validateDetails() {
    const e: Record<string, string> = {};
    if (!babyId) e.babyId = "Please select a baby";
    if (!nextDeliveryDate) e.nextDeliveryDate = "Please choose a delivery date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateShipping() {
    const e: Record<string, string> = {};
    if (!shipping.shippingName) e.shippingName = "Required";
    if (!shipping.shippingAddress1) e.shippingAddress1 = "Required";
    if (!shipping.shippingCity) e.shippingCity = "Required";
    if (!shipping.shippingState) e.shippingState = "Required";
    if (!shipping.shippingZip) e.shippingZip = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (step === "details" && !validateDetails()) return;
    if (step === "diapers" && !selectedBrand) {
      setErrors({ diapers: "Please choose a diaper brand" });
      return;
    }
    if (step === "shipping" && !validateShipping()) return;
    const idx = steps.findIndex(s => s.key === step);
    if (idx < steps.length - 1) setStep(steps[idx + 1].key);
  }

  function back() {
    const idx = steps.findIndex(s => s.key === step);
    if (idx > 0) setStep(steps[idx - 1].key);
  }

  async function handleSubmit() {
    createSub.mutate({
      data: {
        babyId: Number(babyId),
        frequency: String(frequency),
        nextDeliveryDate,
        brand: selectedBrand || undefined,
        ...shipping,
        shippingCountry: "US",
        items: [],
      },
    }, {
      onSuccess: (sub) => {
        queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        // Redirect to Stripe Checkout for recurring billing
        createCheckout.mutate(
          { data: { subscriptionId: sub.id } },
          {
            onSuccess: (session) => {
              if (session.url) {
                window.location.href = session.url;
              } else {
                navigate(`/subscriptions/${sub.id}`);
              }
            },
            onError: () => {
              // If Stripe checkout fails, still go to sub detail so they can retry
              navigate(`/subscriptions/${sub.id}`);
            },
          }
        );
      },
    });
  }

  const stepIdx = steps.findIndex(s => s.key === step);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href="/subscriptions">
            <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">← Back to subscriptions</span>
          </Link>
          <h1 className="font-serif text-3xl font-bold text-foreground mt-3">New subscription</h1>
          <p className="text-muted-foreground mt-1">We'll size up automatically as your baby grows.</p>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-1 mb-8">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <div className={`flex items-center gap-1.5 ${i <= stepIdx ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  i < stepIdx ? "bg-primary border-primary text-primary-foreground" :
                  i === stepIdx ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground"
                }`}>
                  {i < stepIdx ? "✓" : i + 1}
                </div>
                <span className="text-xs font-medium hidden sm:block">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 rounded ${i < stepIdx ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── STEP 1: Details ── */}
          {step === "details" && (
            <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-foreground">Subscription details</h2>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Baby *</label>
                  <select
                    value={babyId}
                    onChange={e => setBabyId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">Select a baby...</option>
                    {babies?.map(baby => (
                      <option key={baby.id} value={baby.id}>{baby.name}</option>
                    ))}
                  </select>
                  {errors.babyId && <p className="text-destructive text-xs mt-1">{errors.babyId}</p>}
                  {babies?.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      No babies yet. <Link href="/babies/new"><span className="text-primary hover:underline cursor-pointer">Add one first.</span></Link>
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Delivery frequency</label>
                    <div className="grid grid-cols-2 gap-2">
                      {FREQ_OPTIONS.map(opt => (
                        <button
                          key={opt.days}
                          type="button"
                          onClick={() => setFrequency(opt.days)}
                          className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${
                            frequency === opt.days
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-foreground hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">First delivery *</label>
                    <input
                      type="date"
                      min={minDate}
                      value={nextDeliveryDate}
                      onChange={e => setNextDeliveryDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    {errors.nextDeliveryDate && <p className="text-destructive text-xs mt-1">{errors.nextDeliveryDate}</p>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: Diapers ── */}
          {step === "diapers" && (
            <motion.div key="diapers" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-6">
                <h2 className="font-semibold text-foreground mb-1">Choose a diaper brand</h2>
                <p className="text-sm text-muted-foreground mb-1">
                  {diapersRec
                    ? <>Based on {selectedBaby?.name ?? "your baby"}'s age, we'll ship diapers {freqRateLabel(frequency)}. The right size is determined automatically.</>
                    : <>The right size is determined automatically as your baby grows.</>
                  }
                </p>
                {diapersRec && (
                  <p className="text-xs text-muted-foreground mb-4 italic">{diapersRec.explanation}</p>
                )}
                {errors.diapers && <p className="text-destructive text-xs mb-3">{errors.diapers}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DIAPER_BRAND_ORDER.map(brand => {
                    const meta = DIAPER_TIERS[brand];
                    if (!meta) return null;
                    const isSelected = selectedBrand === brand;
                    return (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => { setSelectedBrand(brand); setErrors({}); }}
                        className={`text-left rounded-2xl border-2 p-4 transition-all hover:shadow-md ${
                          isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border bg-card hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}>
                            {meta.tier}
                          </span>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">✓</span>
                          )}
                        </div>
                        <div className="font-semibold text-sm text-foreground">{brand}</div>
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{meta.tagline}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: Shipping ── */}
          {step === "shipping" && (
            <motion.div key="shipping" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
                <div>
                  <h2 className="font-semibold text-foreground">Delivery address</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Where should we ship your boxes? Used for every order in this subscription.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Full name *</label>
                  <input
                    value={shipping.shippingName}
                    onChange={e => setShipping(s => ({ ...s, shippingName: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {errors.shippingName && <p className="text-destructive text-xs mt-1">{errors.shippingName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Street address *</label>
                  <input
                    value={shipping.shippingAddress1}
                    onChange={e => setShipping(s => ({ ...s, shippingAddress1: e.target.value }))}
                    placeholder="123 Main St"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {errors.shippingAddress1 && <p className="text-destructive text-xs mt-1">{errors.shippingAddress1}</p>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1.5">City *</label>
                    <input
                      value={shipping.shippingCity}
                      onChange={e => setShipping(s => ({ ...s, shippingCity: e.target.value }))}
                      placeholder="Austin"
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    {errors.shippingCity && <p className="text-destructive text-xs mt-1">{errors.shippingCity}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">State *</label>
                    <input
                      value={shipping.shippingState}
                      onChange={e => setShipping(s => ({ ...s, shippingState: e.target.value }))}
                      placeholder="TX"
                      maxLength={2}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    {errors.shippingState && <p className="text-destructive text-xs mt-1">{errors.shippingState}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">ZIP code *</label>
                    <input
                      value={shipping.shippingZip}
                      onChange={e => setShipping(s => ({ ...s, shippingZip: e.target.value }))}
                      placeholder="78701"
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    {errors.shippingZip && <p className="text-destructive text-xs mt-1">{errors.shippingZip}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Country</label>
                    <input
                      value="United States"
                      disabled
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-muted text-muted-foreground text-sm"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STEP 4: Review ── */}
          {step === "review" && (
            <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-6 space-y-0">
                <h2 className="font-semibold text-foreground mb-3">Review your subscription</h2>
                <div className="divide-y divide-border">
                  <div className="py-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">Baby</span>
                    <span className="font-medium text-foreground">{selectedBaby?.name ?? "—"}</span>
                  </div>
                  <div className="py-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">Frequency</span>
                    <span className="font-medium text-foreground">{freqDisplayLabel(frequency)}</span>
                  </div>
                  <div className="py-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">First delivery</span>
                    <span className="font-medium text-foreground">{fmtDate(nextDeliveryDate)}</span>
                  </div>
                  {selectedBrand && (
                    <div className="py-3 flex justify-between text-sm">
                      <span className="text-muted-foreground">Diaper brand</span>
                      <span className="font-medium text-foreground">{selectedBrand} · size auto-adjusted</span>
                    </div>
                  )}
                  <div className="py-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">Ships to</span>
                    <span className="font-medium text-foreground text-right">
                      {shipping.shippingName}<br />
                      <span className="font-normal text-muted-foreground">{shipping.shippingAddress1}, {shipping.shippingCity}, {shipping.shippingState} {shipping.shippingZip}</span>
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="flex gap-3 mt-6">
          {step === "details" ? (
            <Link href="/subscriptions" className="flex-1">
              <button type="button" className="w-full px-5 py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted">
                Cancel
              </button>
            </Link>
          ) : (
            <button
              type="button"
              onClick={back}
              className="flex-1 px-5 py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted"
            >
              Back
            </button>
          )}

          {step === "review" ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createSub.isPending || createCheckout.isPending}
              className="flex-1 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {createSub.isPending
                ? "Creating…"
                : createCheckout.isPending
                  ? "Redirecting to payment…"
                  : "Proceed to payment →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="flex-1 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Continue
            </button>
          )}
        </div>
        {createSub.isError && (
          <p className="text-destructive text-sm mt-3 text-center">Something went wrong. Please try again.</p>
        )}
      </div>
    </Layout>
  );
}
