import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "./layout";
import { AdminUserDetail } from "./AdminUserDetail";

type AdminUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  banned: boolean;
};

type UsersResponse = {
  totalCount: number;
  users: AdminUser[];
};

async function fetchUsers(): Promise<UsersResponse> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete user");
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function UserAvatar({ user }: { user: AdminUser }) {
  const initials = user.firstName
    ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ""}`.toUpperCase()
    : (user.email?.[0]?.toUpperCase() ?? "?");

  return user.imageUrl ? (
    <img
      src={user.imageUrl}
      alt={user.firstName ?? user.email ?? "User"}
      className="w-9 h-9 rounded-full object-cover border border-border flex-shrink-0"
    />
  ) : (
    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
    },
  });

  const filtered = (data?.users ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground mt-1">
            {data ? `${data.totalCount} registered account${data.totalCount !== 1 ? "s" : ""}` : "All registered accounts"}
          </p>
        </div>
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring w-64"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-card border border-border rounded-3xl">
          <p className="text-4xl mb-3">👥</p>
          <h3 className="font-serif text-xl font-bold text-foreground mb-2">
            {(data?.users ?? []).length === 0 ? "No users yet" : "No users match your search"}
          </h3>
          <p className="text-muted-foreground text-sm">
            {(data?.users ?? []).length === 0
              ? "Users will appear here once someone signs up."
              : "Try a different name or email."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((user, i) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => setSelectedUser(user)}
            >
              <UserAvatar user={user} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground truncate">
                    {user.firstName || user.lastName
                      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                      : user.email ?? "—"}
                  </span>
                  {user.banned && (
                    <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full font-medium">
                      Banned
                    </span>
                  )}
                </div>
                {(user.firstName || user.lastName) && (
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                )}
              </div>

              <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 text-right">
                <span className="text-xs text-muted-foreground">Joined {formatDate(user.createdAt)}</span>
                <span className="text-xs text-muted-foreground">
                  Last sign in: {formatDate(user.lastSignInAt)}
                </span>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(user); }}
                className="shrink-0 text-xs text-muted-foreground hover:text-destructive transition-colors px-3 py-1.5 rounded-lg hover:bg-destructive/5 font-medium"
              >
                Remove
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {selectedUser && (
        <AdminUserDetail
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-xl"
            >
              <h2 className="font-serif text-xl font-bold text-foreground mb-2">Remove user?</h2>
              <p className="text-sm text-muted-foreground mb-5">
                This will permanently delete{" "}
                <span className="font-medium text-foreground">
                  {confirmDelete.email ?? `${confirmDelete.firstName} ${confirmDelete.lastName}`}
                </span>{" "}
                and revoke their access. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate(confirmDelete.id)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 bg-destructive text-destructive-foreground rounded-xl px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {deleteMutation.isPending ? "Removing…" : "Remove user"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
