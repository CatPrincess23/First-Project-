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

import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

setupGuestId();

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
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <img src="/favicon.svg" alt="Whimsical Writer" className="w-14 h-14 mx-auto" />
          <h1 className="text-3xl font-serif font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Whimsical Writer</h1>
          <p className="text-muted-foreground text-sm">Your AI-powered writing companion</p>
        </div>
        <div className="rounded-xl border bg-card p-6 text-center space-y-3 shadow-sm">
          <Sparkles className="w-8 h-8 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Continue without signing in.</p>
          <Button onClick={() => setLocation("/documents")} className="w-full gap-2">
            Continue as Guest <ArrowRight className="w-4 h-4" />
          </Button>
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