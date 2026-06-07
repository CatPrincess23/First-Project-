import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetDocument, useUpdateDocument, useAiSuggest, useAiGrammarCheck, useAiGenerateImage,
  useAiSummarize, useAiGeneratePrologue, useAiChat, useListDocumentVersions, useCreateDocumentVersion,
  getGetDocumentQueryKey, getListDocumentVersionsQueryKey,
} from "@workspace/api-client-react";
import { AiSuggestInputType, AiImageInputSize } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePro } from "@/lib/pro-context";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";
import { exportToPDF, exportToDOCX } from "@/lib/export";
import {
  ArrowLeft, Sparkles, Image as ImageIcon, CheckCircle, Save, Loader2, Wand2,
  Globe, History, FileDown, Sun, Moon, BookOpen, Target, Clock, RotateCcw, MessageCircle,
  Plus, Trash2,
} from "lucide-react";
import { UpgradeModal } from "@/components/upgrade-modal";
import { format } from "date-fns";

export default function Editor({ params }: { params: { id: string } }) {
  const documentId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { useRequest } = usePro();
  const { theme, toggleTheme } = useTheme();

  const { data: document, isLoading: isDocumentLoading } = useGetDocument(documentId, {
    query: { enabled: !!documentId && !isNaN(documentId), queryKey: getGetDocumentQueryKey(documentId) }
  });

  const updateDocument = useUpdateDocument();
  const aiSuggest = useAiSuggest();
  const aiGrammar = useAiGrammarCheck();
  const aiImage = useAiGenerateImage();
  const aiSummarize = useAiSummarize();
  const aiPrologue = useAiGeneratePrologue();
  const aiChat = useAiChat();
  const createVersion = useCreateDocumentVersion();
  const { data: versions = [] } = useListDocumentVersions(documentId, {
    query: { enabled: !isNaN(documentId), queryKey: getListDocumentVersionsQueryKey(documentId) }
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const initRef = useRef<number | null>(null);
  const lastSavedRef = useRef({ title: "", content: "" });
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const isTypingRef = useRef(false);

  // Sidebar tabs
  const [activeTab, setActiveTab] = useState<"grammar" | "suggest" | "ai-tools" | "image" | "history" | "chat">("grammar");

  // Grammar
  const [grammarErrors, setGrammarErrors] = useState<any[]>([]);
  const [correctedText, setCorrectedText] = useState("");
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);

  // Suggest
  const [suggestion, setSuggestion] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestType, setSuggestType] = useState<AiSuggestInputType>(AiSuggestInputType.improve);

  // AI Tools (summarize/prologue)
  const [aiToolResult, setAiToolResult] = useState("");
  const [aiToolType, setAiToolType] = useState<"summary" | "prologue">("summary");
  const [isRunningAiTool, setIsRunningAiTool] = useState(false);

  // Image
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageSize, setImageSize] = useState<AiImageInputSize>(AiImageInputSize["1024x1024"]);
  const [generatedImage, setGeneratedImage] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant", content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const chatDocContent = useRef("");

  // Conversation API helpers
  const apiBase = "/api";

  const loadConversations = useCallback(async () => {
    if (!documentId || isNaN(documentId)) return;
    setIsLoadingConversations(true);
    try {
      const res = await fetch(`${apiBase}/conversations?documentId=${documentId}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {} finally {
      setIsLoadingConversations(false);
    }
  }, [documentId]);

  const createConversation = useCallback(async () => {
    const res = await fetch(`${apiBase}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    const conv = await res.json();
    setConversations(prev => [conv, ...prev]);
    setActiveConversationId(conv.id);
    setChatMessages([]);
    return conv;
  }, [documentId]);

  const deleteConversation = useCallback(async (id: number) => {
    const res = await fetch(`${apiBase}/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setChatMessages([]);
    }
  }, [activeConversationId]);

  const loadConversationMessages = useCallback(async (id: number) => {
    try {
      const res = await fetch(`${apiBase}/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages || []);
      }
    } catch {}
  }, []);

  // Load conversations when document loads
  useEffect(() => {
    if (documentId && !isNaN(documentId)) {
      loadConversations();
    }
  }, [documentId, loadConversations]);

  // Goal tracker
  const [goalWordCount, setGoalWordCount] = useState<number | null>(null);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  // Version history
  const [showSaveVersionDialog, setShowSaveVersionDialog] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");

  // Export
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (document && initRef.current !== documentId) {
      initRef.current = documentId;
      setTitle(document.title);
      setContent(document.content);
      setGoalWordCount(document.goalWordCount ?? null);
      lastSavedRef.current = { title: document.title, content: document.content };
    }
  }, [document, documentId]);

  const updateDocMutate = useRef(updateDocument.mutate);
  updateDocMutate.current = updateDocument.mutate;

  const saveContent = useCallback((newTitle: string, newContent: string) => {
    if (newTitle === lastSavedRef.current.title && newContent === lastSavedRef.current.content) return;
    setIsSaving(true);
    updateDocMutate.current(
      { id: documentId, data: { title: newTitle, content: newContent } },
      {
        onSuccess: (updatedDoc) => {
          lastSavedRef.current = { title: updatedDoc.title, content: updatedDoc.content };
          queryClient.setQueryData(getGetDocumentQueryKey(documentId), (old: any) =>
            old ? { ...old, ...updatedDoc, updatedAt: updatedDoc.updatedAt } : old
          );
          setTimeout(() => setIsSaving(false), 1000);
        },
        onError: () => { setIsSaving(false); toast({ title: "Failed to save", variant: "destructive" }); }
      }
    );
  }, [documentId, queryClient, toast]);

  const doSave = useCallback(() => {
    isTypingRef.current = false;
    saveContent(title, content);
  }, [title, content, saveContent]);

  useEffect(() => {
    if (initRef.current !== documentId) return;
    if (!isTypingRef.current) return;
    const timer = setTimeout(() => doSave(), 800);
    return () => clearTimeout(timer);
  }, [title, content, documentId, doSave]);

  useEffect(() => {
    if (initRef.current !== documentId) return;
    const interval = setInterval(() => doSave(), 60000);
    return () => clearInterval(interval);
  }, [documentId, doSave]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    isTypingRef.current = true;
    setContent(e.currentTarget.value);
  };

  const handleBlur = useCallback(() => {
    doSave();
  }, [doSave]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        doSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave]);

  const handleGrammarCheck = () => {
    if (!content.trim() || !useRequest()) return;
    setIsCheckingGrammar(true);
    aiGrammar.mutate({ data: { text: content } }, {
      onSuccess: (result) => { setGrammarErrors(result.errors); setCorrectedText(result.correctedText); setIsCheckingGrammar(false); },
      onError: () => { setIsCheckingGrammar(false); toast({ title: "Grammar check failed", variant: "destructive" }); }
    });
  };

  const handleApplyGrammar = () => {
    if (!correctedText) return;
    setContent(correctedText);
    setGrammarErrors([]); setCorrectedText("");
  };

  const handleSuggest = (type: AiSuggestInputType) => {
    if (!content.trim() || !useRequest()) return;
    setIsSuggesting(true); setSuggestType(type);
    aiSuggest.mutate({ data: { text: content, type } }, {
      onSuccess: (result) => { setSuggestion(result.suggestion); setIsSuggesting(false); },
      onError: () => { setIsSuggesting(false); toast({ title: "AI suggestion failed", variant: "destructive" }); }
    });
  };

  const handleApplySuggestion = () => {
    if (!suggestion) return;
    setContent(suggestion);
    setSuggestion("");
  };

  const handleSummarize = () => {
    if (!content.trim() || !useRequest()) return;
    setIsRunningAiTool(true); setAiToolType("summary");
    aiSummarize.mutate({ data: { text: content, title } }, {
      onSuccess: (result) => { setAiToolResult(result.summary); setIsRunningAiTool(false); },
      onError: () => { setIsRunningAiTool(false); toast({ title: "Summarize failed", variant: "destructive" }); }
    });
  };

  const handlePrologue = () => {
    if (!content.trim() || !useRequest()) return;
    setIsRunningAiTool(true); setAiToolType("prologue");
    aiPrologue.mutate({ data: { text: content, title } }, {
      onSuccess: (result) => { setAiToolResult(result.prologue); setIsRunningAiTool(false); },
      onError: () => { setIsRunningAiTool(false); toast({ title: "Prologue generation failed", variant: "destructive" }); }
    });
  };

  const handleInsertAiResult = () => {
    const newContent = aiToolType === "summary"
      ? content + "\n\n--- Summary ---\n" + aiToolResult
      : aiToolResult + "\n\n" + content;
    setContent(newContent);
    setAiToolResult("");
  };

  const handleGenerateImage = () => {
    if (!imagePrompt.trim() || !useRequest()) return;
    setIsGeneratingImage(true);
    aiImage.mutate({ data: { prompt: imagePrompt, size: imageSize } }, {
      onSuccess: (result) => { setGeneratedImage(`data:image/png;base64,${result.b64_json}`); setIsGeneratingImage(false); },
      onError: () => { setIsGeneratingImage(false); toast({ title: "Image generation failed", variant: "destructive" }); }
    });
  };

  const handleScanForImage = () => {
    const excerpt = content.trim().slice(0, 300);
    if (excerpt) setImagePrompt(excerpt + ". Fantasy illustration style.");
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !useRequest()) return;

    let convId = activeConversationId;
    if (!convId) {
      try {
        const conv = await createConversation();
        convId = conv.id;
      } catch {
        toast({ title: "Failed to start conversation", variant: "destructive" });
        return;
      }
    }

    const userMsg = { role: "user" as const, content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsChatLoading(true);

    const docContext = content.trim();
    if (docContext) chatDocContent.current = docContext;
    const contextMsg = chatDocContent.current
      ? { role: "system" as const, content: `You are analyzing the user's document. The document is titled "${title}". Here is the full content:\n\n${chatDocContent.current}\n\n---\nWhen the user asks about their writing, refer directly to their document content above. Give specific feedback, point out strengths/weaknesses, and suggest improvements based on what they've written.` }
      : null;

    const messagesPayload = contextMsg ? [contextMsg, userMsg] : [userMsg];
    aiChat.mutate(
      { data: { messages: messagesPayload, conversationId: convId ?? undefined } },
      {
        onSuccess: (result) => {
          setChatMessages(prev => [...prev, { role: "assistant", content: result.reply }]);
          setIsChatLoading(false);
          loadConversations();
        },
        onError: () => {
          setIsChatLoading(false);
          toast({ title: "Chat failed", variant: "destructive" });
        },
      }
    );
  };

  const handleSaveVersion = () => {
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    createVersion.mutate(
      { id: documentId, data: { title, content, wordCount, label: versionLabel || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDocumentVersionsQueryKey(documentId) });
          setShowSaveVersionDialog(false);
          setVersionLabel("");
          toast({ title: "Version saved" });
        },
        onError: () => toast({ title: "Failed to save version", variant: "destructive" })
      }
    );
  };

  const handleRestoreVersion = (version: any) => {
    if (!confirm(`Restore to version "${version.label || format(new Date(version.createdAt), "MMM d, h:mm a")}"? Current content will be overwritten.`)) return;
    setTitle(version.title);
    setContent(version.content);
    toast({ title: "Version restored — save to keep changes" });
  };

  const handleSetGoal = () => {
    const goal = parseInt(goalInput, 10);
    if (isNaN(goal) || goal <= 0) { toast({ title: "Enter a valid word count goal", variant: "destructive" }); return; }
    setGoalWordCount(goal);
    updateDocument.mutate({ id: documentId, data: { goalWordCount: goal } as any }, {
      onSuccess: () => { setShowGoalDialog(false); toast({ title: "Goal set!" }); },
      onError: () => toast({ title: "Failed to set goal", variant: "destructive" })
    });
  };

  const handleExport = async (format: "pdf" | "docx") => {
    setIsExporting(true);
    try {
      if (format === "pdf") await exportToPDF(title, content);
      else await exportToDOCX(title, content);
    } catch (e) {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  if (isDocumentLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const goalProgress = goalWordCount ? Math.min(100, Math.round((wordCount / goalWordCount) * 100)) : null;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Toolbar */}
      <header className="flex-none h-14 border-b px-4 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/documents")} className="shrink-0 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-0 shadow-none font-serif text-lg bg-transparent px-0 focus-visible:ring-0 min-w-0"
            placeholder="Untitled Document"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
            {isSaving ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Saving...</span></> : <><Save className="w-3 h-3" /><span>Saved</span></>}
            <span className="mx-1">·</span>
            <span>{wordCount.toLocaleString()} words</span>
            {goalProgress !== null && (
              <span className={`ml-1 font-medium ${goalProgress >= 100 ? "text-green-500" : ""}`}>
                / {goalWordCount?.toLocaleString()} ({goalProgress}%)
              </span>
            )}
          </div>

          <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground h-8 w-8">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowGoalDialog(true)} className="text-muted-foreground h-8 w-8" title="Set word goal">
            <Target className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowSaveVersionDialog(true)} className="text-muted-foreground h-8 w-8" title="Save version">
            <History className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/world/${documentId}`)} className="text-muted-foreground h-8 w-8" title="World building">
            <Globe className="w-4 h-4" />
          </Button>

          <Select onValueChange={(v) => handleExport(v as "pdf" | "docx")} disabled={isExporting}>
            <SelectTrigger className="h-8 w-auto gap-1 text-xs border-dashed px-2">
              {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
              Export
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">Export as PDF</SelectItem>
              <SelectItem value="docx">Export as DOCX</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Goal Progress Bar */}
      {goalProgress !== null && (
        <div className="flex-none h-1 bg-secondary">
          <div
            className={`h-full transition-all duration-700 ${goalProgress >= 100 ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${goalProgress}%` }}
          />
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor Area */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12 lg:p-24 flex justify-center">
          <div className="w-full max-w-3xl">
            <textarea
              ref={contentRef}
              value={content}
              onChange={handleInput}
              onBlur={handleBlur}
              placeholder="Start writing..."
              className="w-full min-h-[60vh] resize-none outline-none font-serif text-lg leading-relaxed text-foreground bg-transparent border-0 focus-visible:ring-0"
            />
          </div>
        </div>

        {/* AI Sidebar */}
        <div className="w-80 border-l bg-card flex flex-col shrink-0 hidden md:flex">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex flex-col h-full">
            <div className="px-3 py-2.5 border-b shrink-0">
              <TabsList className="grid w-full grid-cols-6 h-8">
                <TabsTrigger value="grammar" title="Grammar" className="text-xs px-1"><CheckCircle className="w-3.5 h-3.5" /></TabsTrigger>
                <TabsTrigger value="suggest" title="AI Rewrite" className="text-xs px-1"><Sparkles className="w-3.5 h-3.5" /></TabsTrigger>
                <TabsTrigger value="ai-tools" title="Summarize / Prologue" className="text-xs px-1"><BookOpen className="w-3.5 h-3.5" /></TabsTrigger>
                <TabsTrigger value="image" title="Generate Image" className="text-xs px-1"><ImageIcon className="w-3.5 h-3.5" /></TabsTrigger>
                <TabsTrigger value="chat" title="AI Chat" className="text-xs px-1"><MessageCircle className="w-3.5 h-3.5" /></TabsTrigger>
                <TabsTrigger value="history" title="Version History" className="text-xs px-1"><History className="w-3.5 h-3.5" /></TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              {/* Grammar Panel */}
              <TabsContent value="grammar" className="p-4 m-0 space-y-4">
                <div>
                  <h3 className="font-medium text-sm mb-1">Grammar & Style</h3>
                  <p className="text-xs text-muted-foreground mb-3">Check your writing for errors and improvements.</p>
                  <Button onClick={handleGrammarCheck} disabled={isCheckingGrammar || !content.trim()} className="w-full gap-2" size="sm">
                    {isCheckingGrammar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    {isCheckingGrammar ? "Checking..." : "Check Document"}
                  </Button>
                </div>
                {grammarErrors.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">{grammarErrors.length} issues found</p>
                    {grammarErrors.map((err, i) => (
                      <div key={i} className="p-3 bg-secondary/50 rounded-lg text-xs space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{err.message}</span>
                          <Badge variant="outline" className="capitalize text-[10px] py-0 shrink-0">{err.type}</Badge>
                        </div>
                        {err.suggestion && <div className="text-muted-foreground bg-background p-1.5 rounded border">→ <span className="font-medium text-foreground">{err.suggestion}</span></div>}
                      </div>
                    ))}
                    {correctedText && <Button onClick={handleApplyGrammar} variant="secondary" className="w-full" size="sm">Apply All Corrections</Button>}
                  </div>
                )}
                {correctedText && grammarErrors.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">✓ No issues found</p>}
              </TabsContent>

              {/* Suggest Panel */}
              <TabsContent value="suggest" className="p-4 m-0 space-y-4">
                <div>
                  <h3 className="font-medium text-sm mb-3">AI Rewrite</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(AiSuggestInputType).map((type) => (
                      <Button key={type} variant={suggestType === type ? "default" : "outline"} size="sm"
                        onClick={() => handleSuggest(type as AiSuggestInputType)} disabled={isSuggesting || !content.trim()} className="capitalize text-xs">
                        {isSuggesting && suggestType === type ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>
                {suggestion && (
                  <div className="space-y-3 pt-3 border-t">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggestion</h4>
                    <div className="p-3 bg-secondary/50 rounded-lg text-sm font-serif leading-relaxed max-h-48 overflow-y-auto">{suggestion}</div>
                    <div className="flex gap-2">
                      <Button onClick={handleApplySuggestion} className="flex-1" size="sm">Apply</Button>
                      <Button onClick={() => setSuggestion("")} variant="outline" className="flex-1" size="sm">Discard</Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* AI Tools Panel (Summarize + Prologue) */}
              <TabsContent value="ai-tools" className="p-4 m-0 space-y-4">
                <div>
                  <h3 className="font-medium text-sm mb-1">AI Document Tools</h3>
                  <p className="text-xs text-muted-foreground mb-3">Analyze your full manuscript.</p>
                  <div className="space-y-2">
                    <Button onClick={handleSummarize} disabled={isRunningAiTool || !content.trim()} className="w-full gap-2" size="sm" variant="outline">
                      {isRunningAiTool && aiToolType === "summary" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                      Summarize Manuscript
                    </Button>
                    <Button onClick={handlePrologue} disabled={isRunningAiTool || !content.trim()} className="w-full gap-2" size="sm" variant="outline">
                      {isRunningAiTool && aiToolType === "prologue" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Generate Prologue
                    </Button>
                  </div>
                </div>
                {aiToolResult && (
                  <div className="space-y-3 pt-3 border-t">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {aiToolType === "summary" ? "Summary" : "Generated Prologue"}
                    </h4>
                    <div className="p-3 bg-secondary/50 rounded-lg text-sm font-serif leading-relaxed max-h-64 overflow-y-auto">{aiToolResult}</div>
                    <div className="flex gap-2">
                      <Button onClick={handleInsertAiResult} className="flex-1" size="sm">
                        {aiToolType === "summary" ? "Append to Doc" : "Prepend as Prologue"}
                      </Button>
                      <Button onClick={() => setAiToolResult("")} variant="outline" size="sm">✕</Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Image Panel */}
              <TabsContent value="image" className="p-4 m-0 space-y-4">
                <div>
                  <h3 className="font-medium text-sm mb-1">Generate Image</h3>
                  <p className="text-xs text-muted-foreground mb-3">Create illustrations for your story.</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium">Prompt</label>
                        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" onClick={handleScanForImage}>
                          <Wand2 className="w-3 h-3" /> Scan text
                        </Button>
                      </div>
                      <Input value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="A mysterious forest at dusk..." className="text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Size</label>
                      <Select value={imageSize} onValueChange={(v: any) => setImageSize(v)}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.values(AiImageInputSize).map(size => <SelectItem key={size} value={size} className="text-xs">{size}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleGenerateImage} disabled={isGeneratingImage || !imagePrompt.trim()} className="w-full gap-2" size="sm">
                      {isGeneratingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      {isGeneratingImage ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </div>
                {generatedImage && (
                  <div className="space-y-2 pt-3 border-t">
                    <div className="rounded-lg overflow-hidden border"><img src={generatedImage} alt="Generated" className="w-full h-auto" /></div>
                    <p className="text-[10px] text-muted-foreground text-center">Right-click to save image</p>
                  </div>
                )}
              </TabsContent>

              {/* Chat Panel */}
              <TabsContent value="chat" className="p-4 m-0 space-y-4 flex flex-col h-full">
                <div>
                  <h3 className="font-medium text-sm mb-1">AI Chat</h3>
                  <p className="text-xs text-muted-foreground mb-3">Ask questions about your writing, get feedback, or brainstorm ideas.</p>
                  {content.trim() && <Badge variant="secondary" className="text-[10px] mb-2 gap-1"><BookOpen className="w-2.5 h-2.5" /> Document synced ({wordCount} words)</Badge>}
                </div>

                {/* Conversation selector */}
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={activeConversationId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setActiveConversationId(id);
                      if (id) loadConversationMessages(id);
                      else setChatMessages([]);
                    }}
                    className="flex-1 text-xs bg-background border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">{isLoadingConversations ? "Loading..." : "New conversation"}</option>
                    {conversations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title.length > 40 ? c.title.slice(0, 40) + "..." : c.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    title="New chat"
                    onClick={() => { setActiveConversationId(null); setChatMessages([]); }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  {activeConversationId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
                      title="Delete conversation"
                      onClick={() => deleteConversation(activeConversationId)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto min-h-0">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Start a conversation with your writing assistant.</p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] p-3 rounded-lg text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/70 text-secondary-foreground"
                      }`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-secondary/70 p-3 rounded-lg">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2 border-t shrink-0">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                    placeholder="Type a message..."
                    className="flex-1 text-sm bg-background border rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-primary min-h-[36px] max-h-20"
                    rows={1}
                  />
                  <Button onClick={handleSendChat} disabled={isChatLoading || !chatInput.trim()} size="sm" className="shrink-0 self-end">
                    {isChatLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </TabsContent>

              {/* Version History Panel */}
              <TabsContent value="history" className="p-4 m-0 space-y-4">
                <div>
                  <h3 className="font-medium text-sm mb-1">Version History</h3>
                  <p className="text-xs text-muted-foreground mb-3">Save snapshots to track your progress.</p>
                  <Button onClick={() => setShowSaveVersionDialog(true)} className="w-full gap-2" size="sm" variant="outline">
                    <History className="w-3.5 h-3.5" /> Save Current Version
                  </Button>
                </div>
                {(versions as any[]).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No versions saved yet</p>
                ) : (
                  <div className="space-y-2">
                    {(versions as any[]).map((v: any) => (
                      <div key={v.id} className="p-3 bg-secondary/40 rounded-lg text-xs space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{v.label || "Checkpoint"}</p>
                            <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5" />{format(new Date(v.createdAt), "MMM d, h:mm a")}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] py-0">{v.wordCount}w</Badge>
                        </div>
                        <Button variant="ghost" size="sm" className="w-full h-6 text-xs gap-1" onClick={() => handleRestoreVersion(v)}>
                          <RotateCcw className="w-2.5 h-2.5" /> Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      {/* Goal Dialog */}
      <Dialog open={showGoalDialog} onOpenChange={setShowGoalDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Target className="w-4 h-4" /> Set Word Count Goal</DialogTitle></DialogHeader>
          {goalWordCount && (
            <div className="space-y-2 py-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current progress</span>
                <span className="font-medium">{wordCount} / {goalWordCount} words</span>
              </div>
              <Progress value={goalProgress ?? 0} className="h-2" />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target word count</label>
            <Input type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)} placeholder="e.g. 80000 for a novel..." min="1" />
          </div>
          <DialogFooter className="gap-2">
            {goalWordCount && <Button variant="outline" size="sm" onClick={() => { setGoalWordCount(null); updateDocument.mutate({ id: documentId, data: { goalWordCount: null } as any }); setShowGoalDialog(false); }}>Remove Goal</Button>}
            <Button onClick={handleSetGoal} disabled={!goalInput}>Set Goal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Version Dialog */}
      <Dialog open={showSaveVersionDialog} onOpenChange={setShowSaveVersionDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Save Version</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Version label <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input value={versionLabel} onChange={e => setVersionLabel(e.target.value)} placeholder="e.g. Chapter 3 draft, Before major edit..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveVersionDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveVersion} disabled={createVersion.isPending}>
              {createVersion.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save Snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UpgradeModal />
    </div>
  );
}
