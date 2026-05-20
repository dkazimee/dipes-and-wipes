import { Link, useLocation, Redirect } from "wouter";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_EMAIL = "dkazimee@gmail.com";

const adminTabs = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/fulfillment", label: "Order Fulfillment" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, user } = useUser();
  const [location] = useLocation();

  if (!isLoaded) {
    return (
      <Layout>
        <div className="space-y-3 mt-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </Layout>
    );
  }

  if (!isSignedIn) return <Redirect to="/sign-in" />;

  const email = user?.primaryEmailAddress?.emailAddress;
  if (email !== ADMIN_EMAIL) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <p className="text-2xl font-semibold text-gray-700">Access denied</p>
          <p className="mt-2 text-gray-500">This page is only available to admins.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
            Admin
          </span>
        </div>
        <div className="flex gap-1 border-b border-border">
          {adminTabs.map((tab) => (
            <Link key={tab.href} href={tab.href}>
              <span
                className={`inline-block px-4 py-2 text-sm font-medium cursor-pointer transition-colors border-b-2 -mb-px ${
                  location.startsWith(tab.href)
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
      {children}
    </Layout>
  );
}
