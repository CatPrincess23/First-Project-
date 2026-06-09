import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ProProvider } from "@/lib/pro-context";
import { ThemeProvider } from "@/lib/theme";
import { setupGuestId } from "@/lib/guest-id";
import Documents from "@/pages/documents";
import Editor from "@/pages/editor";
import WorldBuilding from "@/pages/world";
import { useCreateDocument, getListDocumentsQueryKey, setBaseUrl } from "@workspace/api-client-react";
import { SignIn, SignUp } from "@clerk/react";

// Use local API server when on Vercel (no serverless API)
if (typeof window !== "undefined" && !window.location.hostname.includes("localhost")) {
  setBaseUrl("https://ideal-happiness-6v95j7g75jqx35q6q-5000.app.github.dev");
}

setupGuestId();

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const hasClerkKey = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function HomeRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/documents"); }, [setLocation]);
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

function Router() {
  const { isSignedIn, isLoaded } = useAuth();
  const [location, setLocation] = useLocation();

  // Show loading while Clerk is initializing
  if (hasClerkKey && !isLoaded) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  // If Clerk is enabled and user is not signed in, redirect to sign-in (except for sign-in/sign-up pages)
  if (hasClerkKey && !isSignedIn && location !== "/sign-in" && !location.startsWith("/sign-in/") && location !== "/sign-up" && !location.startsWith("/sign-up/")) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (hasClerkKey) {
    return (
      <Switch>
        <Route path="/sign-in/*">
          <div className="min-h-screen flex items-center justify-center bg-background">
            <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
          </div>
        </Route>
        <Route path="/sign-up/*">
          <div className="min-h-screen flex items-center justify-center bg-background">
            <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
          </div>
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

  return (
    <Switch>
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
