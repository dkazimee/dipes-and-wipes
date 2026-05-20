import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import {
  useGetBaby,
  useListGrowthEntries,
  useGetSizeRecommendation,
  useGetWipesRecommendation,
  useGetDiapersRecommendation,
  useAddGrowthEntry,
  useUpdateGrowthEntry,
  useUpdateBaby,
  useDeleteGrowthEntry,
  getListGrowthEntriesQueryKey,
  getGetBabyQueryKey,
  getGetSizeRecommendationQueryKey,
  getGetWipesRecommendationQueryKey,
  getGetDiapersRecommendationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";

interface GrowthForm {
  recordedAt: string;
  weightLbs: string;
  heightIn: string;
  weightPercentile: string;
  heightPercentile: string;
  notes: string;
}

function ageInMonths(birthDate: string) {
  const birth = new Date(birthDate);
  const now = new Date();
  return Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function formatAge(birthDate: string): string {
  const totalMonths = ageInMonths(birthDate);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} month${months !== 1 ? "s" : ""} old`;
  if (months === 0) return `${years} year${years !== 1 ? "s" : ""} old`;
  return `${years} year${years !== 1 ? "s" : ""} ${months} month${months !== 1 ? "s" : ""} old`;
}

function PredictionBadge({ basis }: { basis?: string }) {
  if (!basis) return null;
  const configs: Record<string, { label: string; className: string }> = {
    "actual-measurement":      { label: "Actual weight",           className: "bg-green-100 text-green-700" },
    "cdc-tracked-percentile":  { label: "CDC tracked percentile",  className: "bg-blue-100 text-blue-700"  },
    "cdc-median":              { label: "CDC median estimate",     className: "bg-amber-100 text-amber-700" },
  };
  const cfg = configs[basis] ?? { label: basis, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
      {basis === "actual-measurement" ? "✓" : basis === "cdc-tracked-percentile" ? "📈" : "📊"} {cfg.label}
    </span>
  );
}

export default function BabyDetail() {
  const { id } = useParams<{ id: string }>();
  const babyId = Number(id);
  const queryClient = useQueryClient();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editGender, setEditGender] = useState("");
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<{
    id: number; recordedAt: string; weightLbs: string; heightIn: string;
    weightPercentile: string; heightPercentile: string; notes: string;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: baby, isLoading: babyLoading } = useGetBaby(babyId, { query: { queryKey: getGetBabyQueryKey(babyId) } });
  const { data: growthEntries } = useListGrowthEntries(babyId, { query: { queryKey: getListGrowthEntriesQueryKey(babyId) } });
  const { data: rec } = useGetSizeRecommendation(babyId, { query: { queryKey: getGetSizeRecommendationQueryKey(babyId) } });
  const { data: wipesRec } = useGetWipesRecommendation(babyId, { query: { queryKey: getGetWipesRecommendationQueryKey(babyId) } });
  const { data: diapersRec } = useGetDiapersRecommendation(babyId, { query: { queryKey: getGetDiapersRecommendationQueryKey(babyId) } });
  const addEntry = useAddGrowthEntry();
  const updateEntry = useUpdateGrowthEntry();
  const deleteEntry = useDeleteGrowthEntry();
  const updateBaby = useUpdateBaby();
  const { register, handleSubmit, reset } = useForm<GrowthForm>();

  const openEditProfile = () => {
    if (!baby) return;
    setEditName(baby.name);
    setEditBirthDate(baby.birthDate);
    setEditGender(baby.gender ?? "");
    setShowEditProfile(true);
  };

  const onSaveProfile = () => {
    if (!editBirthDate) return;
    updateBaby.mutate({
      id: babyId,
      data: {
        name: editName || undefined,
        birthDate: editBirthDate,
        gender: editGender || undefined,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBabyQueryKey(babyId) });
        queryClient.invalidateQueries({ queryKey: getGetSizeRecommendationQueryKey(babyId) });
        setShowEditProfile(false);
      },
    });
  };

  const invalidateGrowth = () => {
    queryClient.invalidateQueries({ queryKey: getListGrowthEntriesQueryKey(babyId) });
    queryClient.invalidateQueries({ queryKey: getGetBabyQueryKey(babyId) });
    queryClient.invalidateQueries({ queryKey: getGetSizeRecommendationQueryKey(babyId) });
  };

  const onSaveEdit = () => {
    if (!editingEntry) return;
    updateEntry.mutate({
      id: babyId,
      entryId: editingEntry.id,
      data: {
        recordedAt: editingEntry.recordedAt,
        weightLbs: editingEntry.weightLbs ? Number(editingEntry.weightLbs) : undefined,
        heightIn: editingEntry.heightIn ? Number(editingEntry.heightIn) : undefined,
        weightPercentile: editingEntry.weightPercentile ? Number(editingEntry.weightPercentile) : undefined,
        heightPercentile: editingEntry.heightPercentile ? Number(editingEntry.heightPercentile) : undefined,
        notes: editingEntry.notes || undefined,
      },
    }, {
      onSuccess: () => { invalidateGrowth(); setEditingEntry(null); },
    });
  };

  const onConfirmDelete = (entryId: number) => {
    deleteEntry.mutate({ id: babyId, entryId }, {
      onSuccess: () => { invalidateGrowth(); setConfirmDeleteId(null); },
    });
  };

  const onSubmitEntry = (data: GrowthForm) => {
    addEntry.mutate({
      id: babyId,
      data: {
        recordedAt: data.recordedAt,
        weightLbs: data.weightLbs ? Number(data.weightLbs) : undefined,
        heightIn: data.heightIn ? Number(data.heightIn) : undefined,
        weightPercentile: data.weightPercentile ? Number(data.weightPercentile) : undefined,
        heightPercentile: data.heightPercentile ? Number(data.heightPercentile) : undefined,
        notes: data.notes || undefined,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGrowthEntriesQueryKey(babyId) });
        queryClient.invalidateQueries({ queryKey: getGetBabyQueryKey(babyId) });
        queryClient.invalidateQueries({ queryKey: getGetSizeRecommendationQueryKey(babyId) });
        setShowAddEntry(false);
        reset();
      },
    });
  };

  if (babyLoading) {
    return (
      <Layout>
        <Skeleton className="h-48 rounded-2xl mb-4" />
        <Skeleton className="h-32 rounded-2xl" />
      </Layout>
    );
  }

  if (!baby) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Baby not found.</p>
          <Link href="/babies"><span className="text-primary text-sm hover:underline cursor-pointer mt-2 block">Back to babies</span></Link>
        </div>
      </Layout>
    );
  }

  const ageMonths = ageInMonths(baby.birthDate);

  return (
    <Layout>
      <div className="mb-6">
        <Link href="/babies">
          <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">← Back to babies</span>
        </Link>
      </div>

      {/* Baby header */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="font-serif text-3xl font-bold text-foreground">{baby.name}</h1>
            <p className="text-muted-foreground mt-0.5">
              {formatAge(baby.birthDate)}
              {baby.gender ? ` · ${baby.gender}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openEditProfile}
              className="text-sm border border-border text-foreground px-4 py-2 rounded-xl font-medium hover:bg-muted transition-colors"
            >
              Edit profile
            </button>
            <Link href="/subscriptions/new">
              <button className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium hover:opacity-90">
                Subscribe
              </button>
            </Link>
          </div>
        </div>

        {showEditProfile && (
          <div className="mb-5 p-4 bg-muted/40 border border-border rounded-xl space-y-4">
            <p className="text-sm font-semibold text-foreground">Edit profile</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Baby's name"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date of birth</label>
                <input
                  type="date"
                  value={editBirthDate}
                  onChange={e => setEditBirthDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Gender (optional)</label>
                <select
                  value={editGender}
                  onChange={e => setEditGender(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Not specified</option>
                  <option value="girl">Girl</option>
                  <option value="boy">Boy</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="flex-1 px-4 py-2 border border-border rounded-xl text-sm text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveProfile}
                disabled={updateBaby.isPending || !editBirthDate}
                className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {updateBaby.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <div className="text-xs text-muted-foreground">Diaper size</div>
            <div className="font-bold text-lg text-primary mt-0.5">
              {rec?.recommendedSize ?? baby.currentDiaperSize ?? "—"}
            </div>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <div className="text-xs text-muted-foreground">Weight</div>
            <div className="font-bold text-foreground mt-0.5">
              {rec?.predictedWeightLbs
                ? `${rec.predictionBasis !== "actual-measurement" ? "~" : ""}${rec.predictedWeightLbs} lbs`
                : baby.currentWeightLbs
                  ? `${baby.currentWeightLbs} lbs`
                  : "—"}
            </div>
            {rec?.predictionBasis && rec.predictionBasis !== "actual-measurement" && (
              <div className="text-[10px] text-muted-foreground mt-0.5">estimated</div>
            )}
          </div>
          {(() => {
            const hasActual = baby.heightPercentile != null || rec?.recentHeightIn != null;
            return (
              <div
                className={`rounded-xl p-3 text-center ${!hasActual ? "bg-amber-50 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors" : "bg-muted/50"}`}
                onClick={!hasActual ? () => setShowAddEntry(true) : undefined}
                title={!hasActual ? "Add a height measurement for a personalised estimate" : undefined}
              >
                <div className={`text-xs mb-0.5 ${!hasActual ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                  Height{!hasActual ? " (estimated)" : ""}
                </div>
                <div className="font-bold text-foreground mt-0.5">
                  {rec?.recentHeightIn
                    ? `${rec.recentHeightIn}"`
                    : rec?.predictedHeightIn
                      ? `~${rec.predictedHeightIn}"`
                      : "—"}
                </div>
                {!hasActual && (
                  <div className="text-[10px] text-amber-600 mt-0.5 font-medium">tap to personalise</div>
                )}
              </div>
            );
          })()}
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <div className="text-xs text-muted-foreground">Wt percentile</div>
            <div className="font-bold text-foreground mt-0.5">
              {rec?.trackedPercentile
                ? ordinal(Math.round(rec.trackedPercentile))
                : baby.weightPercentile
                  ? ordinal(Math.round(baby.weightPercentile))
                  : "—"}
            </div>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <div className="text-xs text-muted-foreground">Ht percentile</div>
            <div className="font-bold text-foreground mt-0.5">
              {baby.heightPercentile
                ? ordinal(Math.round(baby.heightPercentile))
                : rec?.predictedHeightPercentile
                  ? `~${ordinal(Math.round(rec.predictedHeightPercentile))}`
                  : "—"}
            </div>
            {!baby.heightPercentile && rec?.predictedHeightPercentile && (
              <div className="text-[10px] text-muted-foreground mt-0.5">estimated</div>
            )}
          </div>
        </div>
      </div>

      {/* Smart size prediction card */}
      {rec && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border border-primary/20 rounded-2xl p-5 mb-5"
        >
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs font-medium text-primary uppercase tracking-wide">Smart size prediction</div>
              </div>
              <div className="font-serif text-3xl font-bold text-foreground">{rec.recommendedSize}</div>
              {rec.predictedWeightLbs && (
                <div className="text-sm text-muted-foreground mt-0.5">
                  {rec.predictionBasis === "actual-measurement"
                    ? `${rec.predictedWeightLbs} lbs (actual)`
                    : `~${rec.predictedWeightLbs} lbs (predicted)`}
                </div>
              )}
            </div>
            {rec.nextSize && rec.estimatedMonthsInSize != null && (
              <div className="text-right flex-shrink-0">
                <div className="text-xs text-muted-foreground">Sizing up to</div>
                <div className="font-bold text-foreground">{rec.nextSize}</div>
                <div className="text-xs text-muted-foreground">
                  {rec.estimatedMonthsInSize > 0 ? `in ~${rec.estimatedMonthsInSize} mo` : "soon!"}
                </div>
              </div>
            )}
          </div>

          {/* Confidence note */}
          <div className="text-xs text-muted-foreground bg-background/60 rounded-xl p-3 leading-relaxed">
            {rec.confidenceNote}
          </div>

          {/* Next delivery prediction */}
          {rec.predictedSizeAtNextDelivery && rec.nextDeliveryDate && (
            <div className="mt-3 pt-3 border-t border-primary/20 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Predicted size at next delivery ({rec.nextDeliveryDate})</span>
              <span className="font-bold text-primary">{rec.predictedSizeAtNextDelivery}</span>
            </div>
          )}

          {/* Prompt to add measurement if using CDC median */}
          {rec.predictionBasis === "cdc-median" && (
            <button
              onClick={() => setShowAddEntry(true)}
              className="mt-3 w-full text-sm text-primary hover:underline font-medium text-center"
            >
              Add {baby.name}'s first weight for a personalized prediction →
            </button>
          )}
        </motion.div>
      )}

      {/* Diapers consumption estimate */}
      {diapersRec && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="bg-card border border-border rounded-2xl p-5 mb-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Diapers estimate</div>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-3xl font-bold text-foreground">{diapersRec.diapersPerMonth.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">diapers / month</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{diapersRec.changesPerDay} changes/day · 1 diaper per change</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded-xl p-3 leading-relaxed">
            {diapersRec.explanation}
          </div>
        </motion.div>
      )}

      {/* Wipes consumption estimate */}
      {wipesRec && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-card border border-border rounded-2xl p-5 mb-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Wipes estimate</div>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-3xl font-bold text-foreground">{wipesRec.wipesPerMonth.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">wipes / month</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{wipesRec.changesPerDay} changes/day · 4 wipes per change</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded-xl p-3 leading-relaxed">
            {wipesRec.explanation}
          </div>
        </motion.div>
      )}

      {/* Growth entries */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Growth history</h2>
          <button
            onClick={() => setShowAddEntry(!showAddEntry)}
            className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium hover:opacity-90"
          >
            + Add entry
          </button>
        </div>

        {showAddEntry && (
          <form onSubmit={handleSubmit(onSubmitEntry)} className="mb-6 p-4 bg-muted/40 rounded-xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">New growth entry</h3>
              <p className="text-xs text-muted-foreground mt-0.5">The percentile will be auto-calculated from weight if you don't fill it in.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date *</label>
                <input type="date" {...register("recordedAt", { required: true })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Weight (lbs)</label>
                <input type="number" step="0.1" {...register("weightLbs")}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. 15.2" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Height (in)</label>
                <input type="number" step="0.1" {...register("heightIn")}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. 25.0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Wt percentile (optional)</label>
                <input type="number" step="1" {...register("weightPercentile")}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="auto-calculated" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAddEntry(false)}
                className="flex-1 px-4 py-2 border border-border rounded-xl text-sm text-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="submit" disabled={addEntry.isPending}
                className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60">
                {addEntry.isPending ? "Saving..." : "Save entry"}
              </button>
            </div>
          </form>
        )}

        {!growthEntries ? (
          <div className="space-y-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : growthEntries.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">📏</div>
            <p className="text-muted-foreground text-sm">No growth entries yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add entries from pediatrician visits to improve size predictions.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {growthEntries.map((entry, i) => {
              const isEditing = editingEntry?.id === entry.id;
              const isConfirmingDelete = confirmDeleteId === entry.id;

              if (isEditing && editingEntry) {
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 bg-muted/60 border border-border rounded-xl space-y-3"
                  >
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Edit entry</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Date *</label>
                        <input
                          type="date"
                          value={editingEntry.recordedAt}
                          onChange={e => setEditingEntry(prev => prev && ({ ...prev, recordedAt: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Weight (lbs)</label>
                        <input
                          type="number" step="0.1"
                          value={editingEntry.weightLbs}
                          onChange={e => setEditingEntry(prev => prev && ({ ...prev, weightLbs: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          placeholder="e.g. 15.2"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Height (in)</label>
                        <input
                          type="number" step="0.1"
                          value={editingEntry.heightIn}
                          onChange={e => setEditingEntry(prev => prev && ({ ...prev, heightIn: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          placeholder="e.g. 25.0"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Wt percentile (optional)</label>
                        <input
                          type="number" step="1"
                          value={editingEntry.weightPercentile}
                          onChange={e => setEditingEntry(prev => prev && ({ ...prev, weightPercentile: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          placeholder="auto-calculated"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingEntry(null)}
                        className="flex-1 px-4 py-2 border border-border rounded-xl text-sm text-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={onSaveEdit}
                        disabled={updateEntry.isPending}
                        className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        {updateEntry.isPending ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{entry.recordedAt}</span>
                    {entry.weightLbs != null && <span className="text-sm text-muted-foreground">{entry.weightLbs} lbs</span>}
                    {entry.heightIn != null && <span className="text-sm text-muted-foreground">{entry.heightIn}"</span>}
                    {entry.weightPercentile != null && (
                      <span className="text-xs text-muted-foreground">{ordinal(Math.round(entry.weightPercentile))} wt %ile</span>
                    )}
                    {entry.heightPercentile != null && (
                      <span className="text-xs text-muted-foreground">{ordinal(Math.round(entry.heightPercentile))} ht %ile</span>
                    )}
                    {entry.diaperSize && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        {entry.diaperSize}
                      </span>
                    )}
                  </div>

                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-destructive font-medium">Delete?</span>
                      <button
                        onClick={() => onConfirmDelete(entry.id)}
                        disabled={deleteEntry.isPending}
                        className="text-xs bg-destructive text-white px-2.5 py-1 rounded-lg font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        {deleteEntry.isPending ? "…" : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs border border-border px-2.5 py-1 rounded-lg text-foreground hover:bg-muted"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => {
                          setConfirmDeleteId(null);
                          setEditingEntry({
                            id: entry.id,
                            recordedAt: entry.recordedAt,
                            weightLbs: entry.weightLbs != null ? String(entry.weightLbs) : "",
                            heightIn: entry.heightIn != null ? String(entry.heightIn) : "",
                            weightPercentile: entry.weightPercentile != null ? String(Math.round(entry.weightPercentile)) : "",
                            heightPercentile: entry.heightPercentile != null ? String(Math.round(entry.heightPercentile)) : "",
                            notes: entry.notes ?? "",
                          });
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                        title="Edit entry"
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { setEditingEntry(null); setConfirmDeleteId(entry.id); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                        title="Delete entry"
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
