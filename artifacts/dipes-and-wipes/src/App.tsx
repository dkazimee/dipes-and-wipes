import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Babies from "@/pages/babies/index";
import NewBaby from "@/pages/babies/new";
import BabyDetail from "@/pages/babies/detail";
import Subscriptions from "@/pages/subscriptions/index";
import NewSubscription from "@/pages/subscriptions/new";
import SubscriptionDetail from "@/pages/subscriptions/detail";
import Orders from "@/pages/orders";
import ProductsPage from "@/pages/products";
import CheckoutSuccess from "@/pages/checkout-success";
import CheckoutCancel from "@/pages/checkout-cancel";
import CartPage from "@/pages/cart";
import AdminUsers from "@/pages/admin/users";
import AdminFulfillment from "@/pages/admin/fulfillment";
import { CartProvider } from "@/contexts/CartContext";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#2d9e8f",
    colorForeground: "#161f3a",
    colorMutedForeground: "#5a6899",
    colorDanger: "#cc5555",
    colorBackground: "#ffffff",
    colorInput: "#f5f3fc",
    colorInputForeground: "#161f3a",
    colorNeutral: "#d8d4ee",
    fontFamily: "Outfit, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#161f3a] font-semibold",
    headerSubtitle: "text-[#5a6899]",
    socialButtonsBlockButtonText: "text-[#161f3a] font-medium",
    formFieldLabel: "text-[#161f3a] text-sm font-medium",
    footerActionLink: "text-[#2d9e8f] hover:text-[#247d72] font-medium",
    footerActionText: "text-[#5a6899]",
    dividerText: "text-[#5a6899]",
    identityPreviewEditButton: "text-[#2d9e8f]",
    formFieldSuccessText: "text-[#2d9e8f]",
    alertText: "text-[#161f3a]",
    logoBox: "mb-1",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border-[#d8d4ee] hover:bg-[#f5f3fc]",
    formButtonPrimary: "bg-[#2d9e8f] hover:bg-[#247d72] text-white",
    formFieldInput: "border-[#d8d4ee] bg-[#f5f3fc] text-[#161f3a] focus:border-[#2d9e8f]",
    footerAction: "bg-[#f5f3fc]",
    dividerLine: "bg-[#d8d4ee]",
    alert: "bg-[#f5f3fc]",
    otpCodeFieldInput: "border-[#d8d4ee]",
    formFieldRow: "gap-3",
    main: "gap-5",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-[#f5f3fc] to-[#e8f7f5] px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-[#f5f3fc] to-[#e8f7f5] px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/babies/new" component={NewBaby} />
      <Route path="/babies/:id" component={BabyDetail} />
      <Route path="/babies" component={Babies} />
      <Route path="/subscriptions/new" component={NewSubscription} />
      <Route path="/subscriptions/:id" component={SubscriptionDetail} />
      <Route path="/subscriptions" component={Subscriptions} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/orders" component={Orders} />
      <Route path="/checkout/success" component={CheckoutSuccess} />
      <Route path="/checkout/cancel" component={CheckoutCancel} />
      <Route path="/cart" component={CartPage} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/fulfillment" component={AdminFulfillment} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <CartProvider>
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to your Dipes & Wipes account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Start your smart diaper subscription today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
    </CartProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
