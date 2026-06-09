import { useEffect } from "react";
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
import { SignIn, SignUp, useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, Sparkles } from "lucide-react";

setupGuestId();

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && isLocalhost;

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
  const { isLoaded } = useAuth();

  if (clerkEnabled) {
    if (!isLoaded) {
      return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-serif font-bold text-3xl mx-auto shadow-lg shadow-primary/20">
              W
            </div>
            <h1 className="text-3xl font-serif font-bold tracking-tight">WriteAI</h1>
            <p className="text-muted-foreground text-sm">Your AI-powered writing companion</p>
          </div>
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-serif font-bold text-3xl mx-auto shadow-lg shadow-primary/20">
            W
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">WriteAI</h1>
          <p className="text-muted-foreground text-sm">Your AI-powered writing companion</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6 text-center space-y-3 shadow-sm">
            <Sparkles className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Development mode — authentication is disabled.</p>
            <Button onClick={() => setLocation("/documents")} className="w-full gap-2">
              Continue as Guest <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
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
        {clerkEnabled ? (
          <div className="min-h-screen flex items-center justify-center bg-background">
            <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
          </div>
        ) : (
          <NotFound />
        )}
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
  );
}

export default App;