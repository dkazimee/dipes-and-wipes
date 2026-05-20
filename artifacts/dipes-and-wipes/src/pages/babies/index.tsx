import { Link } from "wouter";
import { motion } from "framer-motion";
import { useListBabies, useDeleteBaby, getListBabiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function ageInMonths(birthDate: string) {
  const birth = new Date(birthDate);
  const now = new Date();
  return Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

function formatAge(birthDate: string): string {
  const totalMonths = ageInMonths(birthDate);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} month${months !== 1 ? "s" : ""} old`;
  if (months === 0) return `${years} year${years !== 1 ? "s" : ""} old`;
  return `${years} year${years !== 1 ? "s" : ""} ${months} month${months !== 1 ? "s" : ""} old`;
}

export default function Babies() {
  const { data: babies, isLoading } = useListBabies();
  const deleteBaby = useDeleteBaby();
  const queryClient = useQueryClient();

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove ${name} from your account?`)) return;
    deleteBaby.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBabiesQueryKey() })
    });
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Baby profiles</h1>
          <p className="text-muted-foreground mt-1">Manage your little ones</p>
        </div>
        <Link href="/babies/new">
          <button className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
            Add baby
          </button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : !babies?.length ? (
        <div className="text-center py-24 bg-card border border-border rounded-3xl">
          <div className="text-5xl mb-4 opacity-30">&#x2764;&#xFE0F;</div>
          <h3 className="font-serif text-xl font-bold text-foreground mb-2">No babies yet</h3>
          <p className="text-muted-foreground text-sm mb-6">Add your first baby to get started with smart diaper subscriptions.</p>
          <Link href="/babies/new">
            <button className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90">
              Add your baby
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {babies.map((baby, i) => (
            <motion.div
              key={baby.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Link href={`/babies/${baby.id}`}>
                <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-md transition-shadow cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-serif text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                        {baby.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {formatAge(baby.birthDate)}
                      </p>
                    </div>
                    {baby.gender && (
                      <span className="text-xs bg-accent text-accent-foreground px-2 py-1 rounded-full font-medium capitalize">
                        {baby.gender}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/60 rounded-xl p-3">
                      <div className="text-xs text-muted-foreground mb-0.5">Current size</div>
                      <div className="font-semibold text-sm text-foreground">{baby.currentDiaperSize ?? "Unknown"}</div>
                    </div>
                    <div className="bg-muted/60 rounded-xl p-3">
                      <div className="text-xs text-muted-foreground mb-0.5">Weight</div>
                      <div className="font-semibold text-sm text-foreground">
                        {baby.currentWeightLbs ? `${baby.currentWeightLbs} lbs` : "—"}
                      </div>
                    </div>
                    {baby.weightPercentile && (
                      <div className="bg-muted/60 rounded-xl p-3 col-span-2">
                        <div className="text-xs text-muted-foreground mb-0.5">Percentiles</div>
                        <div className="font-semibold text-sm text-foreground">
                          Weight: {ordinal(Math.round(baby.weightPercentile))}
                          {baby.currentHeightPercentile != null
                            ? ` · Height: ${ordinal(Math.round(baby.currentHeightPercentile))}`
                            : ""}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => handleDelete(baby.id, baby.name)}
                className="mt-2 w-full text-xs text-muted-foreground hover:text-destructive transition-colors text-center"
              >
                Remove
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </Layout>
  );
}
