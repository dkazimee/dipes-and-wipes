import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { useCreateBaby, getListBabiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";

interface BabyForm {
  name: string;
  birthDate: string;
  gender: string;
  currentWeightLbs: string;
  currentHeightIn: string;
  weightPercentile: string;
  heightPercentile: string;
  notes: string;
}

export default function NewBaby() {
  const [, navigate] = useLocation();
  const createBaby = useCreateBaby();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<BabyForm>();

  const onSubmit = (data: BabyForm) => {
    createBaby.mutate({
      data: {
        name: data.name,
        birthDate: data.birthDate,
        gender: data.gender || undefined,
        currentWeightLbs: data.currentWeightLbs ? Number(data.currentWeightLbs) : undefined,
        currentHeightIn: data.currentHeightIn ? Number(data.currentHeightIn) : undefined,
        weightPercentile: data.weightPercentile ? Number(data.weightPercentile) : undefined,
        heightPercentile: data.heightPercentile ? Number(data.heightPercentile) : undefined,
        notes: data.notes || undefined,
      },
    }, {
      onSuccess: (baby) => {
        queryClient.invalidateQueries({ queryKey: getListBabiesQueryKey() });
        navigate(`/babies/${baby.id}`);
      },
    });
  };

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <Link href="/babies">
            <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">← Back to babies</span>
          </Link>
          <h1 className="font-serif text-3xl font-bold text-foreground mt-3">Add your baby</h1>
          <p className="text-muted-foreground mt-1">We'll use this to calculate the perfect diaper size.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h2 className="font-semibold text-foreground">Basic info</h2>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Baby's name *</label>
              <input
                {...register("name", { required: "Name is required" })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="e.g. Lily"
              />
              {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Date of birth *</label>
              <input
                type="date"
                {...register("birthDate", { required: "Birth date is required" })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {errors.birthDate && <p className="text-destructive text-xs mt-1">{errors.birthDate.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Gender</label>
              <select
                {...register("gender")}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h2 className="font-semibold text-foreground">Current measurements</h2>
            <p className="text-sm text-muted-foreground -mt-2">From your most recent pediatrician visit. We use these to calculate the right diaper size.</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Weight (lbs)</label>
                <input
                  type="number"
                  step="0.1"
                  {...register("currentWeightLbs")}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. 14.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Height (inches)</label>
                <input
                  type="number"
                  step="0.1"
                  {...register("currentHeightIn")}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. 24.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Weight percentile</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="99"
                  {...register("weightPercentile")}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. 65"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Height percentile</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="99"
                  {...register("heightPercentile")}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. 72"
                />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <label className="block text-sm font-medium text-foreground mb-1.5">Notes (optional)</label>
            <textarea
              {...register("notes")}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              placeholder="Any notes about your baby..."
            />
          </div>

          <div className="flex gap-3">
            <Link href="/babies">
              <button type="button" className="flex-1 px-5 py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors">
                Cancel
              </button>
            </Link>
            <button
              type="submit"
              disabled={createBaby.isPending}
              className="flex-1 bg-primary text-primary-foreground px-5 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {createBaby.isPending ? "Adding..." : "Add baby"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
