import { useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import {
  useListDocuments, useCreateDocument, useGetDocumentStats, useDeleteDocument,
  getListDocumentsQueryKey, getGetDocumentStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme";
import { usePro } from "@/lib/pro-context";
import {
  Plus, FileText, Trash2, Loader2, ArrowRight, Sun, Moon, Globe, Target,
  LayoutDashboard, Sparkles, BookOpen, Image as ImageIcon, History,
  CheckCircle, Wand2, Crown, User, ChevronRight, HelpCircle, Menu,
  Upload,
} from "lucide-react";
import { UserButton } from "@clerk/react";
import OnboardingTour from "@/components/onboarding-tour";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type View = "home" | "documents" | "world" | "ai-features" | "stats";

// Document content is stored as HTML (TipTap). For list/dashboard previews we
// need the readable text, not the raw tags — strip them. Mirrors the server's
// countWords() decoding so previews match the saved word counts.
function stripHtml(html: string): string {
  return (html || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Defensive: docs from the API should always have wordCount, but stale cache or
// partial responses shouldn't crash the dashboard with a null deref.
function goalPct(wordCount: any, goal: any): number {
  const wc = typeof wordCount === "number" ? wordCount : 0;
  const g = typeof goal === "number" && goal > 0 ? goal : 0;
  return g ? Math.min(100, Math.round((wc / g) * 100)) : 0;
}

const NAV_ITEMS: { id: View; label: string; icon: React.ElementType; description: string }[] = [
  { id: "home", label: "Home", icon: LayoutDashboard, description: "Your writing dashboard" },
  { id: "documents", label: "My Documents", icon: FileText, description: "All your books & manuscripts" },
  { id: "world", label: "World Building", icon: Globe, description: "Characters, places & items" },
  { id: "ai-features", label: "AI Features", icon: Sparkles, description: "What the AI can do" },
  { id: "stats", label: "Writing Stats", icon: LayoutDashboard, description: "Your progress at a glance" },
];

const AI_FEATURES = [
  { icon: CheckCircle, title: "Grammar & Style Checker", desc: "Real-time linting as you write. Catch errors and get corrected text instantly.", tier: "free" },
  { icon: Wand2, title: "AI Rewrite Assistant", desc: "Improve, expand, shorten, rephrase, or continue any piece of text.", tier: "free" },
  { icon: BookOpen, title: "Book Summarizer", desc: "Scan your full manuscript and generate a concise literary summary.", tier: "pro" },
  { icon: Sparkles, title: "Prologue Generator", desc: "AI drafts a compelling prologue based on your manuscript's plot and tone.", tier: "pro" },
  { icon: ImageIcon, title: "Image Generation", desc: "Generate illustrations for characters, scenes, or locations using DALL·E 3.", tier: "pro" },
  { icon: Globe, title: "World Building Portfolio", desc: "Structured profiles for characters, places, and items — with AI images.", tier: "free" },
  { icon: History, title: "Version History", desc: "Save named snapshots of your manuscript and restore any previous version.", tier: "pro" },
  { icon: FileText, title: "Export PDF & DOCX", desc: "Download your manuscript in publication-ready formats.", tier: "free" },
];

export default function Documents() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPro } = usePro();
  const { theme, toggleTheme } = useTheme();
  const [activeView, setActiveView] = useState<View>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileFileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  const { data: documents, isLoading: isLoadingDocs, isError: isDocsError } = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const { data: stats, isLoading: isLoadingStats } = useGetDocumentStats({ query: { queryKey: getGetDocumentStatsQueryKey() } });
  const docs = Array.isArray(documents) ? documents : [];
  const createDoc = useCreateDocument();
  const deleteDoc = useDeleteDocument();

  const handleCreateDocument = () => {
    createDoc.mutate({ data: { title: "Untitled Document", content: "" } }, {
      onSuccess: (newDoc) => {
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDocumentStatsQueryKey() });
        setLocation(`/editor/${newDoc.id}`);
      },
      onError: () => toast({ title: "Failed to create document", variant: "destructive" })
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        let msg = "Upload failed";
        try { const err = await res.json(); if (err?.error) msg = err.error; } catch { /* non-JSON error body */ }
        throw new Error(msg);
      }
      const data = await res.json();
      // Upload succeeded; clipboard copy is best-effort and can fail for
      // permissions / non-secure contexts — don't report it as an upload failure.
      try { await navigator.clipboard.writeText(data.url); } catch { /* clipboard blocked */ }
      toast({ title: "Image uploaded! URL copied to clipboard." });
    } catch (err: any) {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
      input.value = "";
    }
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Delete this document?")) return;
    deleteDoc.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDocumentStatsQueryKey() });
        toast({ title: "Document deleted" });
      },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" })
    });
  };

  const DOCS_TOUR_STEPS = [
    { target: "#tour-home-hero", title: "Welcome to Whimsical Writer", description: "Your AI-powered creative writing companion. Create documents, build worlds, and track your progress — all in one place.", placement: "bottom" as const },
    { target: "#tour-docs-new", title: "Create a New Document", description: "Start a fresh manuscript with one click. Each document gets its own AI chat, versions, and world-building space.", placement: "right" as const },
    { target: "#tour-docs-upload", title: "Upload Images", description: "Upload images from your computer. The image URL is copied to your clipboard so you can paste it anywhere.", placement: "right" as const },
    { target: "#tour-home-world", title: "Build Your World", description: "Create character profiles, map out locations, and define key items for your fictional universe.", placement: "bottom" as const },
    { target: "#tour-home-ai", title: "AI-Powered Tools", description: "Grammar checks, rewrites, summarization, prologue generation, and image creation — all built into the editor sidebar.", placement: "bottom" as const },
    { target: "#tour-home-stats", title: "Track Your Progress", description: "See your word count, writing streaks, and goal completion at a glance.", placement: "bottom" as const },
  ];

  const [tourVersion, setTourVersion] = useState(0);
  const restartTour = () => {
    localStorage.removeItem("wa-tour-seen-documents");
    setTourVersion(v => v + 1);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile sidebar */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-40 md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 [&>button]:hidden">
          <div className="h-full flex flex-col">
            <div className="h-16 flex items-center gap-3 px-4 border-b shrink-0">
              <img src="/favicon.svg" alt="Whimsical Writer" className="w-8 h-8 shrink-0" />
              <div className="min-w-0">
                <div className="font-serif font-semibold text-base leading-tight tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Whimsical Writer</div>
                {isPro && <div className="text-[10px] text-primary font-bold uppercase tracking-wider">Pro</div>}
              </div>
            </div>
            <div className="p-3 border-b shrink-0 space-y-2">
              <Button onClick={handleCreateDocument} disabled={createDoc.isPending} className="w-full gap-2" size="sm">
                {createDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
                New Document
              </Button>
              <input type="file" ref={mobileFileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
              <Button onClick={() => mobileFileInputRef.current?.click()} disabled={isUploading} variant="outline" className="w-full gap-2" size="sm">
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Upload className="w-4 h-4 shrink-0" />}
                {isUploading ? "Uploading..." : "Upload Image"}
              </Button>
            </div>
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <SheetTrigger asChild key={id}>
                  <button
                    onClick={() => setActiveView(id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left
                      ${activeView === id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                </SheetTrigger>
              ))}
            </nav>
            <div className="p-3 border-t space-y-1 shrink-0">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground h-8 w-8">
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={restartTour} className="h-8 w-8 text-primary" title="Show tour">
                  <HelpCircle className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className={`${sidebarCollapsed ? "w-16" : "w-60"} flex-none border-r bg-card flex-col transition-all duration-200 sticky top-0 h-screen overflow-hidden hidden md:flex`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b shrink-0">
          <img src="/favicon.svg" alt="Whimsical Writer" className="w-8 h-8 shrink-0" />
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="font-serif font-semibold text-base leading-tight tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Whimsical Writer</div>
              {isPro && <div className="text-[10px] text-primary font-bold uppercase tracking-wider">Pro</div>}
            </div>
          )}
        </div>

        {/* New Document Button */}
        <div id="tour-docs-new" className="p-3 border-b shrink-0 space-y-2">
          <Button
            onClick={handleCreateDocument}
            disabled={createDoc.isPending}
            className={`w-full gap-2 ${sidebarCollapsed ? "px-0 justify-center" : ""}`}
            size="sm"
          >
            {createDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
            {!sidebarCollapsed && "New Document"}
          </Button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
          <Button
            id="tour-docs-upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            variant="outline"
            className={`w-full gap-2 ${sidebarCollapsed ? "px-0 justify-center" : ""}`}
            size="sm"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Upload className="w-4 h-4 shrink-0" />}
            {!sidebarCollapsed && (isUploading ? "Uploading..." : "Upload Image")}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`tour-docs-${id}`}
              onClick={() => setActiveView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left
                ${activeView === id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }
                ${sidebarCollapsed ? "justify-center px-2" : ""}
              `}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom Controls */}
        <div className="p-3 border-t space-y-1 shrink-0">
          {!sidebarCollapsed && !isPro && (
            <button
              onClick={() => {}} 
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors mb-2"
            >
              <Crown className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium">Upgrade to Pro</span>
            </button>
          )}
          {clerkEnabled && (
            <div className="flex justify-center mb-2">
              <UserButton />
            </div>
          )}
          <div className={`flex items-center ${sidebarCollapsed ? "flex-col gap-2" : "justify-between"}`}>
            <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground h-8 w-8">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={restartTour} className="h-8 w-8 text-primary" title="Show tour">
              <HelpCircle className="w-4 h-4" />
            </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(c => !c)} className="text-muted-foreground h-8 w-8">
              <ChevronRight className={`w-4 h-4 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`} />
            </Button>
          </div>
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center mt-1" : "px-1 mt-1"}`}>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto md:ml-0">
        {/* Home View */}
        {activeView === "home" && (
          <div className="p-6 md:p-8 space-y-8">
            {/* Hero */}
            <div id="tour-home-hero" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 p-8 md:p-10 text-white">
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur p-0.5 shadow-lg">
                    <img src="/favicon.svg" alt="Whimsical Writer" className="w-full h-full rounded-[10px]" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-serif font-bold">Welcome to Whimsical Writer</h1>
                    <p className="text-indigo-200 dark:text-indigo-100 text-sm mt-1">Your AI-powered creative writing companion</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-6">
                  <Button onClick={handleCreateDocument} disabled={createDoc.isPending} className="bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-gray-700 gap-2 shadow-lg" size="sm">
                    {createDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    New Document
                  </Button>
                  <Button variant="secondary" className="bg-white/15 text-white hover:bg-white/25 border-0 gap-2 shadow-lg" size="sm"
                    onClick={() => setActiveView("ai-features")}>
                    <Sparkles className="w-4 h-4" /> Explore AI Tools
                  </Button>
                </div>
              </div>
              {/* Decorative stars */}
              <div className="absolute top-4 right-8 text-2xl opacity-30 select-none pointer-events-none">✦ ✧ ✦</div>
              <div className="absolute bottom-4 right-12 text-lg opacity-20 select-none pointer-events-none">✧ ✦ ✧</div>
            </div>

            {/* Stats Overview */}
            {!isLoadingStats && stats && (stats.totalDocuments ?? 0) > 0 && (
              <div id="tour-home-stats" className="grid grid-cols-3 gap-4">
                <Card className="shadow-sm border-indigo-500/10">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardDescription className="text-xs uppercase tracking-wide flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Documents
                    </CardDescription>
                    <CardTitle className="text-3xl font-serif mt-1">{(stats.totalDocuments ?? 0).toLocaleString()}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm border-indigo-500/10">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardDescription className="text-xs uppercase tracking-wide flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Words Written
                    </CardDescription>
                    <CardTitle className="text-3xl font-serif mt-1">{(stats.totalWords ?? 0).toLocaleString()}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm border-indigo-500/10">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardDescription className="text-xs uppercase tracking-wide flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI Requests
                    </CardDescription>
                    <CardTitle className="text-3xl font-serif mt-1">Unlimited</CardTitle>
                  </CardHeader>
                </Card>
              </div>
            )}

            {/* Quick Access */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card id="tour-home-world" className="shadow-sm cursor-pointer group hover:border-primary/50 transition-colors"
                onClick={() => setActiveView("world")}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                      <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">World Building</CardTitle>
                      <CardDescription className="text-xs mt-0.5">Characters, places & items</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">Build rich fictional worlds with structured profiles for every character, location, and item in your story.</p>
                </CardContent>
                <CardFooter className="pt-0 pb-4">
                  <span className="text-xs font-medium text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    Explore <ChevronRight className="w-3 h-3" />
                  </span>
                </CardFooter>
              </Card>

              <Card id="tour-home-ai" className="shadow-sm cursor-pointer group hover:border-primary/50 transition-colors"
                onClick={() => setActiveView("ai-features")}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                      <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">AI Tools</CardTitle>
                      <CardDescription className="text-xs mt-0.5">Grammar, rewrite, summarize & more</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">Grammar checking, rewriting, summarization, prologue generation, image creation, and persistent AI chat — all in the editor.</p>
                </CardContent>
                <CardFooter className="pt-0 pb-4">
                  <span className="text-xs font-medium text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    Explore <ChevronRight className="w-3 h-3" />
                  </span>
                </CardFooter>
              </Card>

              <Card className="shadow-sm cursor-pointer group hover:border-primary/50 transition-colors"
                onClick={() => setActiveView("stats")}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                      <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Writing Stats</CardTitle>
                      <CardDescription className="text-xs mt-0.5">Track your progress</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">Monitor your word counts, writing goals, and see how your manuscript is growing over time.</p>
                </CardContent>
                <CardFooter className="pt-0 pb-4">
                  <span className="text-xs font-medium text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    View Stats <ChevronRight className="w-3 h-3" />
                  </span>
                </CardFooter>
              </Card>
            </div>

            {/* Recent Documents */}
            {!isLoadingDocs && docs.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-serif font-semibold">Recent Documents</h2>
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setActiveView("documents")}>
                    View all <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {docs.slice(0, 6).map((doc) => (
                    <Link key={doc.id} href={`/editor/${doc.id}`}>
                      <Card className="h-full cursor-pointer group hover:border-primary/50 transition-colors shadow-sm">
                        <CardHeader className="pb-3">
                          <CardTitle className="font-serif text-base line-clamp-1 group-hover:text-primary transition-colors">
                            {doc.title || "Untitled Document"}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1 flex items-center gap-2">
                            <span>{(doc.wordCount ?? 0).toLocaleString()} words</span>
                            <span>·</span>
                            <span>{format(new Date(doc.updatedAt), "MMM d")}</span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0 flex-1">
                          <p className="text-xs text-muted-foreground line-clamp-2">{stripHtml(doc.content) || "Empty document..."}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {!isLoadingDocs && docs.length === 0 && (
              <div className="text-center py-16 px-6 border-2 border-dashed rounded-xl bg-card/50">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-medium mb-2">Start your first story</h3>
                <p className="text-muted-foreground mb-6 text-sm max-w-sm mx-auto">Create a document and begin writing with the power of AI at your side.</p>
                <Button onClick={handleCreateDocument} disabled={createDoc.isPending} className="gap-2">
                  <Plus className="w-4 h-4" /> Create First Document
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Documents View */}
        {activeView === "documents" && (
          <div className="p-6 md:p-8 space-y-8">
            <div>
              <h1 id="tour-docs-header" className="text-2xl font-serif font-bold">My Documents</h1>
              <p className="text-muted-foreground text-sm mt-1">Your manuscripts, chapters, and notes.</p>
            </div>

            {isLoadingDocs ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="h-48"><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>
                ))}
              </div>
            ) : isDocsError ? (
              <div className="text-center py-24 px-6 border-2 border-dashed rounded-xl bg-card/50">
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-lg font-medium mb-2">Could not load documents</h3>
                <p className="text-muted-foreground mb-6 text-sm max-w-sm mx-auto">The server is not running. Start the API server to continue.</p>
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-24 px-6 border-2 border-dashed rounded-xl bg-card/50">
                <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No documents yet</h3>
                <p className="text-muted-foreground mb-6 text-sm max-w-sm mx-auto">Create your first document and start writing with AI assistance.</p>
                <Button onClick={handleCreateDocument} disabled={createDoc.isPending} className="gap-2">
                  <Plus className="w-4 h-4" /> Create First Document
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {docs.map((doc) => (
                  <Link key={doc.id} href={`/editor/${doc.id}`}>
                    <Card className="h-full flex flex-col cursor-pointer group hover:border-primary/50 transition-colors shadow-sm">
                      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="font-serif text-lg line-clamp-1 group-hover:text-primary transition-colors">
                            {doc.title || "Untitled Document"}
                          </CardTitle>
                          <CardDescription className="mt-1 flex items-center gap-2 text-xs flex-wrap">
                            <span>{format(new Date(doc.updatedAt), "MMM d, yyyy")}</span>
                            <span>·</span>
                            <span>{(doc.wordCount ?? 0).toLocaleString()} words</span>
                            {doc.goalWordCount && (
                              <span className="flex items-center gap-0.5 text-primary font-medium">
                                <Target className="w-2.5 h-2.5" />{goalPct(doc.wordCount, doc.goalWordCount)}%
                              </span>
                            )}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1 shrink-0 -mt-1 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLocation(`/world/${doc.id}`); }} title="World building">
                            <Globe className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDelete(e, doc.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1">
                        <p className="text-muted-foreground text-sm line-clamp-3 leading-relaxed">{stripHtml(doc.content) || "Empty document..."}</p>
                      </CardContent>
                      {doc.goalWordCount && (
                        <div className="px-6 pb-2">
                          <div className="h-1 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${goalPct(doc.wordCount, doc.goalWordCount)}%` }} />
                          </div>
                        </div>
                      )}
                      <CardFooter className="pt-0 pb-4">
                        <span className="text-sm font-medium text-primary flex items-center opacity-0 group-hover:opacity-100 transition-all translate-x-[-8px] group-hover:translate-x-0 duration-200">
                          Open editor <ArrowRight className="w-4 h-4 ml-1" />
                        </span>
                      </CardFooter>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* World Building View */}
        {activeView === "world" && (
          <div className="p-6 md:p-8 space-y-8">
            <div>
              <h1 className="text-2xl font-serif font-bold">World Building</h1>
              <p className="text-muted-foreground text-sm mt-1">Manage characters, places, and items for each of your books.</p>
            </div>

            {isLoadingDocs ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map(i => <Card key={i} className="h-28"><CardHeader><Skeleton className="h-6 w-2/3" /></CardHeader></Card>)}
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-24 border-2 border-dashed rounded-xl bg-card/50">
                <Globe className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                <h3 className="font-medium mb-1">No books yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create a document first, then build its world here.</p>
                <Button onClick={handleCreateDocument} disabled={createDoc.isPending} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" /> Create a Document
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {docs.map((doc) => (
                  <Card key={doc.id} className="group hover:border-primary/50 transition-colors cursor-pointer shadow-sm"
                    onClick={() => setLocation(`/world/${doc.id}`)}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="font-serif text-lg line-clamp-1 group-hover:text-primary transition-colors">
                            {doc.title || "Untitled Document"}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">{(doc.wordCount ?? 0).toLocaleString()} words · {format(new Date(doc.updatedAt), "MMM d, yyyy")}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="p-2 bg-secondary rounded-lg group-hover:bg-primary/10 transition-colors">
                            <Globe className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" /> Characters</span>
                        <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Places</span>
                        <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Items</span>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 pb-4">
                      <span className="text-xs font-medium text-primary flex items-center opacity-0 group-hover:opacity-100 transition-all translate-x-[-8px] group-hover:translate-x-0 duration-200">
                        Open world <ArrowRight className="w-3 h-3 ml-1" />
                      </span>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Features View */}
        {activeView === "ai-features" && (
          <div className="p-6 md:p-8 space-y-8">
            <div>
              <h1 className="text-2xl font-serif font-bold">AI Features</h1>
              <p className="text-muted-foreground text-sm mt-1">Everything the AI can help you with inside the editor.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {AI_FEATURES.map(({ icon: Icon, title, desc }) => (
                <Card key={title} className="shadow-sm border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{title}</CardTitle>
                        </div>
                        <CardDescription className="text-sm mt-1 leading-relaxed">{desc}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {!isPro && (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Crown className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                    <div>
                      <CardTitle className="text-base">Unlock Pro features</CardTitle>
                      <CardDescription className="text-sm mt-0.5">Get unlimited AI requests, version history, book summarizer, prologue generator, and more.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )}

            <div className="pt-2">
              <Button onClick={handleCreateDocument} disabled={createDoc.isPending} className="gap-2">
                {createDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Start Writing & Try AI Features
              </Button>
            </div>
          </div>
        )}

        {/* Stats View */}
        {activeView === "stats" && (
          <div className="p-6 md:p-8 space-y-8">
            <div>
              <h1 className="text-2xl font-serif font-bold">Writing Stats</h1>
              <p className="text-muted-foreground text-sm mt-1">Your progress across all documents.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase tracking-wide">Total Documents</CardDescription>
                  <CardTitle className="text-5xl font-serif mt-1">
                    {isLoadingStats ? <Skeleton className="h-12 w-16" /> : stats?.totalDocuments ?? 0}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase tracking-wide">Total Words Written</CardDescription>
                  <CardTitle className="text-5xl font-serif mt-1">
                    {isLoadingStats ? <Skeleton className="h-12 w-24" /> : (stats?.totalWords ?? 0).toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase tracking-wide">Avg Words / Document</CardDescription>
                  <CardTitle className="text-5xl font-serif mt-1">
                    {isLoadingStats ? <Skeleton className="h-12 w-20" /> :
                      stats?.totalDocuments ? Math.round((stats.totalWords ?? 0) / stats.totalDocuments).toLocaleString() : "—"}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {!isLoadingStats && (stats?.recentDocuments?.length ?? 0) > 0 && (
              <div>
                <h2 className="text-lg font-serif font-semibold mb-4">Recently Updated</h2>
                <div className="space-y-2">
                  {stats?.recentDocuments?.map((doc: any) => (
                    <div key={doc.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:border-primary/40 cursor-pointer transition-colors group"
                      onClick={() => setLocation(`/editor/${doc.id}`)}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium line-clamp-1 group-hover:text-primary transition-colors">{doc.title || "Untitled Document"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{(doc.wordCount ?? 0).toLocaleString()} words · {format(new Date(doc.updatedAt), "MMM d, yyyy")}</p>
                      </div>
                      {doc.goalWordCount && (
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xs font-medium text-primary">{goalPct(doc.wordCount, doc.goalWordCount)}% of goal</p>
                          <div className="w-24 h-1.5 bg-secondary rounded-full mt-1">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${goalPct(doc.wordCount, doc.goalWordCount)}%` }} />
                          </div>
                        </div>
                      )}
                      <ArrowRight className="w-4 h-4 text-muted-foreground ml-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isLoadingStats && (stats?.totalDocuments ?? 0) === 0 && (
              <div className="text-center py-16 border-2 border-dashed rounded-xl">
                <LayoutDashboard className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No stats yet — start writing to see your progress here.</p>
                <Button onClick={handleCreateDocument} disabled={createDoc.isPending} className="mt-4 gap-2" size="sm">
                  <Plus className="w-4 h-4" /> Create a Document
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
      <OnboardingTour key={tourVersion} steps={DOCS_TOUR_STEPS} tourKey="documents" />
    </div>
  );
}
