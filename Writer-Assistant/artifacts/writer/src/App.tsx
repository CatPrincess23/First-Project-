import { Component, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ProProvider } from "@/lib/pro-context";
import { ThemeProvider } from "@/lib/theme";
import { setupGuestId } from "@/lib/guest-id";
import Documents from "@/pages/documents";
import Editor from "@/pages/editor";
import WorldBuilding from "@/pages/world";
import { useCreateDocument, getListDocumentsQueryKey } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { SignIn, SignUp } from "@clerk/react";

// Shared branded hero block for the auth screens.
function AuthHero() {
  return (
    <div className="text-center space-y-3">
      <img src="/favicon.svg" alt="Whimsical Writer" className="w-14 h-14 mx-auto" />
      <h1 className="text-3xl font-serif font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Whimsical Writer</h1>
      <p className="text-muted-foreground text-sm">Your AI-powered writing companion</p>
    </div>
  );
}

setupGuestId();

// Clerk is opt-in: only render the hosted <SignIn>/<SignUp> components when a
// publishable key is configured. Deployments without one run guest-only, so the
// auth pages show a guest CTA instead of a broken/empty Clerk form.
const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Fallback shown on the auth pages when Clerk isn't configured for this deploy.
function GuestOnlyNotice({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="rounded-xl border bg-card p-6 text-center space-y-3 shadow-sm">
      <p className="text-sm text-muted-foreground">
        Account sign-in isn&rsquo;t available on this deployment yet.
      </p>
      <Button onClick={onContinue} className="w-full gap-2">
        Continue as Guest <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// Catch render errors so the page never goes completely white.
window.addEventListener("error", () => {});
window.addEventListener("unhandledrejection", () => {});

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-3 max-w-sm">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">A temporary error occurred. Your work is safe.</p>
            <Button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>
              Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function HomeRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/sign-in"); }, [setLocation]);
  return null;
}

function EditorNewRedirect() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createDoc = useCreateDocument();
  useEffect(() => {
    createDoc.mutate({ data: { title: "Untitled Document", content: "" } }, {
      onSuccess: (newDoc) => { queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() }); setLocation(`/editor/${newDoc.id}`); }
    });
  }, []);
  return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
}

function SignInPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <AuthHero />
        {/* Clerk pre-built sign-in (renders the modern @clerk/ui design via the
            ui prop on ClerkProvider). routing="path" lets Clerk own its
            multi-step flow under /sign-in/*; wouter's "/sign-in/*?" route keeps
            this page mounted for all sub-paths. */}
        {clerkEnabled ? (
          <SignIn
            routing="path"
            path="/sign-in"
            fallbackRedirectUrl="/documents"
            signUpUrl="/sign-up"
          />
        ) : (
          <GuestOnlyNotice onContinue={() => setLocation("/documents")} />
        )}
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setLocation("/sign-up")}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            New here? Create an account
          </button>
          <button
            onClick={() => setLocation("/documents")}
            className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            Continue as guest <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SignUpPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <AuthHero />
        {clerkEnabled ? (
          <SignUp
            routing="path"
            path="/sign-up"
            fallbackRedirectUrl="/documents"
            signInUrl="/sign-in"
          />
        ) : (
          <GuestOnlyNotice onContinue={() => setLocation("/documents")} />
        )}
        <div className="text-center text-sm">
          <button
            onClick={() => setLocation("/sign-in")}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in/*?">
        <SignInPage />
      </Route>
      <Route path="/sign-up/*?">
        <SignUpPage />
      </Route>
      <Route path="/" component={HomeRedirect} />
      <Route path="/documents" component={Documents} />
      <Route path="/editor/new" component={EditorNewRedirect} />
      <Route path="/editor/:id" component={Editor} />
      <Route path="/world/:id" component={WorldBuilding} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <ProProvider>
              <WouterRouter base={basePath}>
                <Router />
              </WouterRouter>
              <Toaster />
            </ProProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;