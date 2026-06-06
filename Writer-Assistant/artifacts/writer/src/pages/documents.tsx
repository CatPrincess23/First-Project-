import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme";
import { usePro } from "@/lib/pro-context";
import {
  Plus, FileText, Trash2, Loader2, ArrowRight, Sun, Moon, Globe, Target,
  LayoutDashboard, Sparkles, BookOpen, Image as ImageIcon, History,
  CheckCircle, Wand2, Crown, User, ChevronRight,
} from "lucide-react";

type View = "documents" | "world" | "ai-features" | "stats";

const NAV_ITEMS: { id: View; label: string; icon: React.ElementType; description: string }[] = [
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
  const [activeView, setActiveView] = useState<View>("documents");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? "w-16" : "w-60"} flex-none border-r bg-card flex flex-col transition-all duration-200 sticky top-0 h-screen overflow-hidden`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b shrink-0">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-serif font-bold text-lg shrink-0">W</div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="font-serif font-semibold text-base leading-tight tracking-tight">WriteAI</div>
              {isPro && <div className="text-[10px] text-primary font-bold uppercase tracking-wider">Pro</div>}
            </div>
          )}
        </div>

        {/* New Document Button */}
        <div className="p-3 border-b shrink-0">
          <Button
            onClick={handleCreateDocument}
            disabled={createDoc.isPending}
            className={`w-full gap-2 ${sidebarCollapsed ? "px-0 justify-center" : ""}`}
            size="sm"
          >
            {createDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
            {!sidebarCollapsed && "New Document"}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
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
          <div className={`flex items-center ${sidebarCollapsed ? "flex-col gap-2" : "justify-between"}`}>
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground h-8 w-8">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(c => !c)} className="text-muted-foreground h-8 w-8">
              <ChevronRight className={`w-4 h-4 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`} />
            </Button>
          </div>
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center mt-1" : "px-1 mt-1"}`}>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Documents View */}
        {activeView === "documents" && (
          <div className="p-6 md:p-8 space-y-8">
            <div>
              <h1 className="text-2xl font-serif font-bold">My Documents</h1>
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
                            <span>{doc.wordCount.toLocaleString()} words</span>
                            {doc.goalWordCount && (
                              <span className="flex items-center gap-0.5 text-primary font-medium">
                                <Target className="w-2.5 h-2.5" />{Math.round((doc.wordCount / doc.goalWordCount) * 100)}%
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
                        <p className="text-muted-foreground text-sm line-clamp-3 leading-relaxed">{doc.content || "Empty document..."}</p>
                      </CardContent>
                      {doc.goalWordCount && (
                        <div className="px-6 pb-2">
                          <div className="h-1 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.round((doc.wordCount / doc.goalWordCount) * 100))}%` }} />
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
                          <CardDescription className="text-xs mt-1">{doc.wordCount.toLocaleString()} words · {format(new Date(doc.updatedAt), "MMM d, yyyy")}</CardDescription>
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
              {AI_FEATURES.map(({ icon: Icon, title, desc, tier }) => (
                <Card key={title} className="shadow-sm border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{title}</CardTitle>
                          <Badge variant={tier === "pro" ? "default" : "secondary"} className={`text-[10px] py-0 px-1.5 h-4 ${tier === "pro" ? "bg-amber-500 text-white hover:bg-amber-500" : ""}`}>
                            {tier === "pro" ? "PRO" : "FREE"}
                          </Badge>
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
                    <Crown className="w-5 h-5 text-amber-500" />
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
                        <p className="text-xs text-muted-foreground mt-0.5">{doc.wordCount.toLocaleString()} words · {format(new Date(doc.updatedAt), "MMM d, yyyy")}</p>
                      </div>
                      {doc.goalWordCount && (
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xs font-medium text-primary">{Math.round((doc.wordCount / doc.goalWordCount) * 100)}% of goal</p>
                          <div className="w-24 h-1.5 bg-secondary rounded-full mt-1">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.round((doc.wordCount / doc.goalWordCount) * 100))}%` }} />
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
    </div>
  );
}
