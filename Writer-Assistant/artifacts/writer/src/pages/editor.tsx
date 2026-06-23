import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useGetDocument, useUpdateDocument, useAiSuggest, useAiGrammarCheck, useAiGenerateImage,
  useAiSummarize, useAiGeneratePrologue, useAiChat, useListDocumentVersions, useCreateDocumentVersion,
  useDeleteDocumentVersion, getGetDocumentQueryKey, getListDocumentVersionsQueryKey,
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
import RichTextEditor from "@/components/rich-text-editor";
import {
  ArrowLeft, Sparkles, Image as ImageIcon, CheckCircle, Save, Loader2, Wand2,
  Globe, History, FileDown, Sun, Moon, BookOpen, Target, Clock, RotateCcw, MessageCircle,
  Plus, Trash2, ChevronRight, ChevronLeft,
} from "lucide-react";
import { UserButton } from "@clerk/react";
import { UpgradeModal } from "@/components/upgrade-modal";
import OnboardingTour from "@/components/onboarding-tour";
import { format } from "date-fns";

export default function Editor({ params }: { params: { id: string } }) {
  const documentId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { useRequest } = usePro();
  const { theme, toggleTheme } = useTheme();

  const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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
  const deleteVersion = useDeleteDocumentVersion();
  const { data: versions = [] } = useListDocumentVersions(documentId, {
    query: { enabled: !isNaN(documentId), queryKey: getListDocumentVersionsQueryKey(documentId) }
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedWordCount, setSelectedWordCount] = useState(0);

  const initRef = useRef<number | null>(null);
  const lastSavedRef = useRef({ title: "", content: "" });
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const isTypingRef = useRef(false);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const isUndoRedoingRef = useRef(false);
  const contentSnapshotRef = useRef(content);
  contentSnapshotRef.current = content;

  // Sidebar collapse
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Editor readiness: only render TipTap after content is loaded
  const [editorReady, setEditorReady] = useState(false);

  // Sidebar tabs
  const [activeTab, setActiveTab] = useState<"grammar" | "suggest" | "ai-tools" | "image" | "history" | "chat">("grammar");

  const decodeEntities = useCallback((text: string) => text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16))), []);

  const stripHtml = useCallback((html: string) => decodeEntities(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), [decodeEntities]);

  // Grammar
  const [grammarErrors, setGrammarErrors] = useState<any[]>([]);
  const [correctedText, setCorrectedText] = useState("");
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  const grammarErrorsRef = useRef(grammarErrors);
  grammarErrorsRef.current = grammarErrors;

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
  const [entityType, setEntityType] = useState<"person" | "animal" | "place" | "thing" | "">("");
  const [entityNameInput, setEntityNameInput] = useState("");
  const [scannedEntities, setScannedEntities] = useState<{ name: string; description: string; details: string }[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<{ name: string; description: string; details: string } | null>(null);
  const [isScanningEntities, setIsScanningEntities] = useState(false);

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
      setEditorReady(true);
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

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    if (initRef.current !== documentId) return;
    // Use refs so the interval is not re-created on every keystroke
    const interval = setInterval(() => saveContent(titleRef.current, contentSnapshotRef.current), 60000);
    return () => clearInterval(interval);
  }, [documentId, saveContent]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isTypingRef.current && !isUndoRedoingRef.current) {
      undoStackRef.current.push(contentSnapshotRef.current);
      redoStackRef.current = [];
      if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    }
    isTypingRef.current = true;
    setContent(e.currentTarget.value);
    if (grammarErrors.length > 0) { setGrammarErrors([]); setCorrectedText(""); }
  };

  const handleBlur = useCallback(() => {
    saveContent(title, content);
  }, [saveContent, title, content]);

  function undoRedoAction(action: "undo" | "redo") {
    const stack = action === "undo" ? undoStackRef : redoStackRef;
    const other = action === "undo" ? redoStackRef : undoStackRef;
    if (stack.current.length === 0) return;
    isUndoRedoingRef.current = true;
    const current = contentSnapshotRef.current;
    const target = stack.current.pop()!;
    other.current.push(current);
    setContent(target);
    if (contentRef.current) {
      contentRef.current.value = target;
      contentRef.current.focus();
      contentRef.current.selectionStart = target.length;
    }
    setTimeout(() => { isUndoRedoingRef.current = false; }, 200);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveContent(title, content);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRedoAction("undo");
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        undoRedoAction("redo");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveContent, title, content]);

  const buildHighlightSegments = useCallback((text: string, errors: any[]) => {
    if (!errors.length) return [{ text }];
    const sorted = [...errors].sort((a, b) => a.offset - b.offset);
    const segments: { text: string; error?: { type: string; message: string } }[] = [];
    let pos = 0;
    for (const err of sorted) {
      if (err.offset > pos) segments.push({ text: text.slice(pos, err.offset) });
      const end = Math.min(err.offset + err.length, text.length);
      segments.push({ text: text.slice(err.offset, end), error: { type: err.type, message: err.message } });
      pos = end;
    }
    if (pos < text.length) segments.push({ text: text.slice(pos) });
    return segments;
  }, []);

  const errorHighlightClass = (type: string) =>
    type === "spelling" ? "border-b-2 border-red-500 bg-red-500/15" :
    type === "grammar" ? "border-b-2 border-amber-500 bg-amber-500/15" :
    type === "punctuation" ? "border-b-2 border-purple-500 bg-purple-500/15" :
    "border-b-2 border-blue-500 bg-blue-500/15";

  const syncHighlightScroll = useCallback(() => {
    if (highlightRef.current && contentRef.current) {
      highlightRef.current.scrollTop = contentRef.current.scrollTop;
      highlightRef.current.scrollLeft = contentRef.current.scrollLeft;
    }
  }, []);

  const handleGrammarCheck = () => {
    if (!stripHtml(content).trim() || !useRequest()) return;
    setIsCheckingGrammar(true);
    aiGrammar.mutate({ data: { text: stripHtml(content) } }, {
      onSuccess: (result) => { setGrammarErrors(result.errors); setCorrectedText(result.correctedText); setIsCheckingGrammar(false); },
      onError: () => { setIsCheckingGrammar(false); toast({ title: "Grammar check unavailable right now" }); }
    });
  };

  const handleApplyGrammar = () => {
    if (!correctedText) return;
    setContent(correctedText);
    setGrammarErrors([]); setCorrectedText("");
  };

  const handleApplySingleError = (index: number) => {
    const err = grammarErrors[index];
    if (!err) return;
    const before = content.slice(0, err.offset);
    const after = content.slice(err.offset + err.length);
    const suggestion = err.suggestion || "";
    const newContent = before + suggestion + after;
    setContent(newContent);

    const delta = suggestion.length - err.length;
    const newErrors = grammarErrors
      .filter((_, i) => i !== index)
      .map(e => {
        // Only shift errors that start after the end of the fixed span
        if (e.offset >= err.offset + err.length) return { ...e, offset: e.offset + delta };
        return e;
      });

    if (newErrors.length === 0) {
      setGrammarErrors([]);
      setCorrectedText("");
    } else {
      setGrammarErrors(newErrors);
    }
  };

  const scrollToError = useCallback((offset: number, length: number) => {
    const ta = contentRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(offset, offset + length);
    // Ensure selection is visible
    const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 28;
    const before = ta.value.slice(0, offset);
    const line = before.split("\n").length - 1;
    ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight / 3);
  }, []);

  const handleSuggest = (type: AiSuggestInputType) => {
    if (!stripHtml(content).trim() || !useRequest()) return;
    setIsSuggesting(true); setSuggestType(type);
    aiSuggest.mutate({ data: { text: stripHtml(content), type } }, {
      onSuccess: (result) => { setSuggestion(result.suggestion); setIsSuggesting(false); },
      onError: () => { setIsSuggesting(false); toast({ title: "AI suggestions unavailable right now" }); }
    });
  };

  const handleApplySuggestion = () => {
    if (!suggestion) return;
    setContent(suggestion);
    setSuggestion("");
  };

  const handleSummarize = () => {
    if (!stripHtml(content).trim() || !useRequest()) return;
    setIsRunningAiTool(true); setAiToolType("summary");
    aiSummarize.mutate({ data: { text: stripHtml(content), title } }, {
      onSuccess: (result) => { setAiToolResult(result.summary); setIsRunningAiTool(false); },
      onError: () => { setIsRunningAiTool(false); toast({ title: "Summarize unavailable right now" }); }
    });
  };

  const handlePrologue = () => {
    if (!stripHtml(content).trim() || !useRequest()) return;
    setIsRunningAiTool(true); setAiToolType("prologue");
    aiPrologue.mutate({ data: { text: stripHtml(content), title } }, {
      onSuccess: (result) => { setAiToolResult(result.prologue); setIsRunningAiTool(false); },
      onError: () => { setIsRunningAiTool(false); toast({ title: "Prologue generation unavailable right now" }); }
    });
  };

  const handleInsertAiResult = () => {
    const newContent = aiToolType === "summary"
      ? content + "\n\n--- Summary ---\n" + aiToolResult
      : aiToolResult + "\n\n" + content;
    setContent(newContent);
    setAiToolResult("");
  };

  const handleScanEntities = async () => {
    if (!entityType || !stripHtml(content).trim() || !useRequest()) return;
    setIsScanningEntities(true);
    setScannedEntities([]);
    setSelectedEntity(null);
    try {
      const body: Record<string, unknown> = { type: entityType, documentContent: stripHtml(content) };
      if (entityNameInput.trim()) {
        body.entityName = entityNameInput.trim();
      }
      const res = await fetch("/api/ai/scan-entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json();
      setScannedEntities(data.entities || []);
      if (!data.entities?.length) {
        toast({ title: `No ${entityType}s found in the document` });
      } else if (entityNameInput.trim() && data.entities.length === 1) {
        setSelectedEntity(data.entities[0]);
        setImagePrompt(data.entities[0].description + ". Fantasy illustration, detailed, artistic.");
      }
    } catch {
      toast({ title: "Entity scan unavailable right now" });
    } finally {
      setIsScanningEntities(false);
    }
  };

  const handleSelectEntity = (entity: { name: string; description: string; details: string }) => {
    setSelectedEntity(entity);
    setImagePrompt(entity.description + ". Fantasy illustration, detailed, artistic.");
  };

  const handleGenerateImage = () => {
    if (!imagePrompt.trim() || !useRequest()) return;
    setIsGeneratingImage(true);
    const body: any = { prompt: imagePrompt, size: imageSize };
    if (selectedEntity) {
      body.entityType = entityType;
      body.entityName = selectedEntity.name;
      body.documentContent = stripHtml(content);
    }
    aiImage.mutate({ data: body }, {
      onSuccess: (result) => {
        const mime = (result as any).mime || "image/png";
        setGeneratedImage(`data:${mime};base64,${result.b64_json}`);
        setIsGeneratingImage(false);
      },
      onError: () => { setIsGeneratingImage(false); toast({ title: "Image generation unavailable right now" }); }
    });
  };

  const handleScanForImage = () => {
    const excerpt = stripHtml(content).trim().slice(0, 300);
    if (excerpt) setImagePrompt(excerpt + ". Fantasy illustration style.");
    setSelectedEntity(null);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !useRequest() || isChatLoading) return;

    setIsChatLoading(true);

    let convId = activeConversationId;
    if (!convId) {
      try {
        const conv = await createConversation();
        convId = conv.id;
      } catch (e) {
        setIsChatLoading(false);
        toast({ title: "Chat unavailable right now" });
        return;
      }
    }

    const userMsg = { role: "user" as const, content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");

    const docContext = stripHtml(content).trim();
    if (docContext) chatDocContent.current = docContext;
    const wordCount = chatDocContent.current ? chatDocContent.current.trim().split(/\s+/).length : 0;
    const contextMsg = chatDocContent.current
      ? { role: "system" as const, content: `The user's document is titled "${title}" (${wordCount} words). Here is the full content — READ IT ALL:\n\n${chatDocContent.current}\n\n---\nYou have the COMPLETE document above. Scan and analyze it entirely. Give specific feedback based on the actual text: point out strengths, weaknesses, style, pacing, character development, plot structure. Quote examples. Offer concrete improvements. Be proactive — mention things the user didn't ask for if you notice something important.` }
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
          toast({ title: "Chat unavailable right now" });
        },
      }
    );
  };

  const handleSaveVersion = () => {
    const text = stripHtml(content).trim();
    const wc = text ? text.split(/\s+/).length : 0;
    createVersion.mutate(
      { id: documentId, data: { title, content, wordCount: wc, label: versionLabel || null } },
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
    await new Promise(r => setTimeout(r, 50));
    try {
      if (format === "pdf") await exportToPDF(title, content);
      else await exportToDOCX(title, content);
    } catch (e) {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const wordCount = useMemo(() => {
    const text = stripHtml(content).trim();
    return text ? text.split(/\s+/).length : 0;
  }, [content, stripHtml]);

  if (isDocumentLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  const goalProgress = goalWordCount ? Math.min(100, Math.round((wordCount / goalWordCount) * 100)) : null;

  const EDITOR_TOUR_STEPS = [
    { target: "#tour-editor-title", title: "Name Your Work", description: "Give your document a title. Changes auto-save within a second after you stop typing.", placement: "bottom" as const },
    { target: "#tour-editor-textarea", title: "Your Canvas", description: "This is where the magic happens. Write freely — grammar highlights, AI suggestions, and word count tracking work in real-time.", placement: "bottom" as const },
    { target: "#tour-editor-sidebar", title: "AI Writing Assistant", description: "Grammar check, AI rewrites, summarization, prologue generation, chat with the AI about your document, and image creation — all in one sidebar.", placement: "left" as const },
    { target: "#tour-editor-undo", title: "Undo & Redo", description: "Made a mistake? Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z) let you step through your editing history.", placement: "bottom" as const },
    { target: "#tour-editor-export", title: "Export Your Work", description: "When you're ready, export your document as a polished PDF or DOCX file with one click.", placement: "bottom" as const },
    { target: "#tour-editor-table", title: "Insert Tables", description: "Add tables to your document. Click to open the grid, then hover and click to pick your desired rows and columns.", placement: "bottom" as const },
    { target: "#tour-editor-chart", title: "Insert Charts", description: "Add bar, line, pie, or area charts to your document. Perfect for visualizing data, stats, or comparisons in your writing.", placement: "bottom" as const },
  ];

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Toolbar */}
      <header className="flex-none h-14 border-b px-4 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/documents")} className="shrink-0 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Input
            id="tour-editor-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
              autoSaveTimer.current = setTimeout(() => saveContent(e.target.value, contentSnapshotRef.current), 500);
            }}
            className="border-0 shadow-none font-serif text-lg bg-transparent px-0 focus-visible:ring-0 min-w-0"
            placeholder="Untitled Document"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
            {isSaving ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Saving...</span></> : <><Save className="w-3 h-3 text-green-500 dark:text-green-400" /><span>Saved</span></>}
            <span className="mx-1">·</span>
            {selectedWordCount > 0 ? (
              <span className="text-primary font-medium">{selectedWordCount.toLocaleString()} words</span>
            ) : (
              <span>{wordCount.toLocaleString()} words</span>
            )}
            {goalProgress !== null && (
              <span className={`ml-1 font-medium ${goalProgress >= 100 ? "text-green-500 dark:text-green-400" : ""}`}>
                / {goalWordCount?.toLocaleString()} ({goalProgress}%)
              </span>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => saveContent(title, content)} className="h-7 text-xs gap-1" disabled={isSaving}>
            <Save className="w-3 h-3" /> Save
          </Button>

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

          <div id="tour-editor-export">
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
          {clerkEnabled && <UserButton />}
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
        <div className="flex-1 overflow-y-auto flex justify-center">
          <div id="tour-editor-textarea" className="w-full max-w-3xl px-4 md:px-8 py-6">
            {editorReady ? (
            <RichTextEditor key={documentId} content={content} onBlur={() => saveContent(title, content)} onChange={(html) => {
              setContent(html);
              if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
              autoSaveTimer.current = setTimeout(() => saveContent(title, html), 500);
              if (grammarErrorsRef.current.length > 0) { setGrammarErrors([]); setCorrectedText(""); }
            }} onSelectionChange={(text) => {
              setSelectedWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
            }} placeholder="Start writing..." />
            ) : (
              <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* AI Sidebar */}
        <div className="flex shrink-0">
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="border-l bg-card hover:bg-muted transition-colors flex items-center justify-center w-5"
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>

          {sidebarOpen && (
          <div id="tour-editor-sidebar" className="w-80 border-l bg-card flex flex-col">
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

            <div className="flex-1 min-h-0">
              {/* Grammar Panel */}
              <TabsContent value="grammar" className="p-4 m-0 space-y-4 h-full overflow-y-auto">
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
                    <p className="text-xs font-medium text-muted-foreground">{grammarErrors.length} issue{grammarErrors.length !== 1 ? "s" : ""} found</p>
                    {grammarErrors.map((err, i) => (
                      <div key={i} className="p-3 bg-secondary/50 rounded-lg text-xs space-y-2 cursor-pointer hover:bg-secondary/80 transition-colors" onClick={() => scrollToError(err.offset, err.length)}>
                        <div className="flex items-start justify-between gap-2">
                          <Badge variant="outline" className={`
                            capitalize text-[10px] py-0 shrink-0
                            ${err.type === "spelling" ? "border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30" : ""}
                            ${err.type === "grammar" ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30" : ""}
                            ${err.type === "punctuation" ? "border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30" : ""}
                            ${err.type === "style" ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30" : ""}
                          `}>{err.type}</Badge>
                        </div>
                        <div className="space-y-1">
                          <div
                            className="text-muted-foreground line-through bg-background/70 p-1.5 rounded border border-dashed cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={(e) => { e.stopPropagation(); scrollToError(err.offset, err.length); }}
                          >{content.slice(err.offset, err.offset + err.length)}</div>
                          {err.suggestion && (
                            <div
                              className="bg-green-50 dark:bg-green-950/30 p-1.5 rounded border border-green-200 dark:border-green-800 cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleApplySingleError(i); }}
                            >
                              <span className="font-medium text-green-700 dark:text-green-400">{err.suggestion}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {correctedText && <Button onClick={handleApplyGrammar} className="w-full gap-1.5" size="sm">Apply All {grammarErrors.length} Correction{grammarErrors.length !== 1 ? "s" : ""}</Button>}
                  </div>
                )}
                {correctedText && grammarErrors.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">✓ No issues found</p>}
              </TabsContent>

              {/* Suggest Panel */}
              <TabsContent value="suggest" className="p-4 m-0 space-y-4 h-full overflow-y-auto">
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
              <TabsContent value="ai-tools" className="p-4 m-0 space-y-4 h-full overflow-y-auto">
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
              <TabsContent value="image" className="p-4 m-0 space-y-4 h-full overflow-y-auto">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Image generation is unavailable right now</p>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">No image API key is configured. This feature will work once a valid API key is set up.</p>
                </div>
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
              <TabsContent value="history" className="p-4 m-0 space-y-4 h-full overflow-y-auto">
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
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px] py-0">{v.wordCount}w</Badge>
                              <button
                                onClick={() => {
                                  if (!confirm(`Delete version "${v.label || format(new Date(v.createdAt), "MMM d, h:mm a")}"?`)) return;
                                  deleteVersion.mutate({ id: documentId, versionId: v.id }, {
                                    onSuccess: () => {
                                      queryClient.invalidateQueries({ queryKey: getListDocumentVersionsQueryKey(documentId) });
                                      toast({ title: "Version deleted" });
                                    },
                                    onError: () => toast({ title: "Failed to delete version", variant: "destructive" }),
                                  });
                                }}
                                className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                                title="Delete version"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="w-full h-6 text-xs gap-1" onClick={() => handleRestoreVersion(v)}>
                            <RotateCcw className="w-2.5 h-2.5" /> Restore
                          </Button>
                        </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
          )}
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
      <OnboardingTour steps={EDITOR_TOUR_STEPS} tourKey="editor" />
    </div>
  );
}
