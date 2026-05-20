import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser, Show } from "@clerk/react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/contexts/CartContext";

const ADMIN_EMAIL = "dkazimee@gmail.com";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/babies", label: "Babies" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/products", label: "Shop" },
  { href: "/orders", label: "Orders" },
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function UserMenu() {
  const { signOut } = useClerk();
  const { user } = useUser();

  const initials = user?.firstName
    ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ""}`.toUpperCase()
    : user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt={user.fullName ?? "User"}
            className="w-8 h-8 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
            {initials}
          </div>
        )}
        <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">
          {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? "Account"}
        </span>
      </div>
      <button
        onClick={() => signOut({ redirectUrl: basePath || "/" })}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
      >
        Sign out
      </button>
    </div>
  );
}


function CartIcon() {
  const { totalItems } = useCart();
  return (
    <Link href="/cart">
      <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Cart">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {totalItems > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
            {totalItems > 99 ? "99+" : totalItems}
          </span>
        )}
      </button>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL;
  const visibleNavItems = isAdmin
    ? [...navItems, { href: "/admin/users", label: "Admin" }]
    : navItems;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/">
              <img src="/logo.png" alt="Dipes & Wipes" className="h-14 w-auto cursor-pointer" />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {visibleNavItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <span
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                      location.startsWith(item.href)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Show when="signed-in">
                <CartIcon />
                <Link href="/subscriptions/new">
                  <button className="hidden sm:block bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
                    New Subscription
                  </button>
                </Link>
                <UserMenu />
              </Show>
              <Show when="signed-out">
                <Link href="/sign-in">
                  <button className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted font-medium">
                    Sign in
                  </button>
                </Link>
                <Link href="/sign-up">
                  <button className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
                    Get started
                  </button>
                </Link>
              </Show>

              {/* Hamburger — mobile only */}
              <button
                className="md:hidden ml-1 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => setMobileOpen((o) => !o)}
                aria-label="Toggle menu"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  {mobileOpen ? (
                    <path fillRule="evenodd" clipRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
                  ) : (
                    <path fillRule="evenodd" clipRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="md:hidden border-t border-border bg-background overflow-hidden"
            >
              <nav className="px-4 py-3 flex flex-col gap-1">
                {visibleNavItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <span
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                        location.startsWith(item.href)
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                ))}
                <Show when="signed-in">
                  <Link href="/subscriptions/new">
                    <span
                      onClick={() => setMobileOpen(false)}
                      className="block px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground mt-1 text-center cursor-pointer"
                    >
                      New Subscription
                    </span>
                  </Link>
                </Show>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
