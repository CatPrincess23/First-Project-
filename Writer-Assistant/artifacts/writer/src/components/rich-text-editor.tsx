import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState, memo, forwardRef, useImperativeHandle } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Undo2, Redo2, Minus, Code, FileCode, BarChart3, Upload, Highlighter, Link as LinkIcon, Image as ImageIcon,
} from "lucide-react";
import { TableKit } from "@tiptap/extension-table";
import { ChartExtension } from "@/extensions/chart";
import ChartCreator from "@/components/chart-creator";
import TableGridPopover from "@/components/table-grid-popover";
import TableHandle from "@/components/table-handle";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// Require an absolute URL with an allowed scheme; rejects javascript:, data:,
// relative/scheme-less input, and anything else that could be an XSS vector.
function isSafeUrl(url: string): boolean {
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

// Luminance classification for the dark-mode color override. Hex colors (the
// common case — every value coming from <input type="color"> is #rrggbb) are
// parsed inline with zero DOM access; non-hex (rgb()/named colors from pasted
// HTML) fall back to a one-time getComputedStyle probe. Results are cached so
// the darkColorFix plugin never forces layout/style recalc on the typing hot
// path — that was the main INP culprit on long docs with many colored spans.
const luminanceCache = new Map<string, boolean>();
function isDarkColor(color: string): boolean {
  const cached = luminanceCache.get(color);
  if (cached !== undefined) return cached;
  let result = false;
  const c = color.trim().toLowerCase();
  const hexMatch = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    let r: number, g: number, b: number;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    result = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  } else {
    // rgb()/rgba()/named colors — probe once and cache.
    try {
      const el = document.createElement("div");
      el.style.color = color;
      el.style.display = "none";
      document.body.appendChild(el);
      const computed = window.getComputedStyle(el).color;
      document.body.removeChild(el);
      const m = computed.match(/\d+/g);
      if (m && m.length >= 3) {
        const [r, g, b] = m.map(Number);
        result = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
      }
    } catch { /* ignore */ }
  }
  luminanceCache.set(color, result);
  return result;
}

const fonts = [
  "Serif", "Sans-Serif", "Monospace", "Georgia", "Times New Roman",
  "Arial", "Helvetica", "Courier New", "Verdana", "Trebuchet MS",
];

const fontSizes = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px"];

const ToolbarButton = memo(function ToolbarButton({ onClick, active, children, title, id }: {
  onClick: () => void; active?: boolean; children: React.ReactNode; title?: string; id?: string;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded hover:bg-muted transition-colors ${active ? "bg-muted text-primary" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );
});

const ToolbarSelect = memo(function ToolbarSelect({ value, onChange, options, onMouseDown }: {
  value: string; onChange: (v: string) => void; options: string[]; onMouseDown?: () => void;
}) {
  return (
    <select
      value={value}
      onChange={e => {
        const v = e.target.value;
        if (v) onChange(v);
      }}
      onMouseDown={() => onMouseDown?.()}
      className="h-7 text-xs rounded border bg-background px-1.5 text-foreground"
    >
      <option value="" disabled>—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
});

interface GrammarError {
  offset: number;
  length: number;
  type: "spelling" | "grammar" | "style" | "punctuation";
  message?: string;
  suggestion?: string;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  onSelectionChange?: (selectedText: string) => void;
  grammarErrors?: GrammarError[];
  editable?: boolean;
}

export interface RichTextEditorHandle {
  // Imperatively replace the editor's document. The `content` prop is only used
  // as the initial value (the memo comparator below intentionally skips content
  // changes to keep typing off the React render path), so external updates —
  // grammar apply, AI suggestion apply, version restore — must go through here.
  setContent: (html: string) => void;
  focus: () => void;
}

function RichTextEditor({ content, onChange, onBlur, placeholder, onSelectionChange, grammarErrors, editable = true }: RichTextEditorProps, ref: React.Ref<RichTextEditorHandle>) {
  const rafRef = useRef<number>(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<any>(null);
  const grammarRef = useRef<GrammarError[]>([]);
  grammarRef.current = grammarErrors || [];

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        undoRedo: { depth: 100 },
        link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
      }),
      TextStyle,
      FontSize,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Image,
      ChartExtension,
      TableKit.configure({
        table: { resizable: true, allowTableNodeSelection: true },
      }),
      // Grammar highlight extension
      Extension.create({
        name: "grammarHighlight",
        addProseMirrorPlugins() {
          const errorColors: Record<string, string> = {
            spelling: "red", grammar: "orange", style: "blue", punctuation: "gold",
          };
          return [
            new Plugin({
              key: new PluginKey("grammar-decorations"),
              props: {
                decorations(state) {
                  const errors = grammarRef.current;
                  if (!errors.length) return null;
                  const decos: Decoration[] = [];
                  const doc = state.doc;
                  const textNodes: { text: string; pos: number }[] = [];
                  doc.descendants((node, pos) => {
                    if (node.isText) textNodes.push({ text: node.text!, pos });
                  });

                  for (const err of errors) {
                    if (err.length <= 0) continue;
                    const errEnd = err.offset + err.length;
                    let cumPos = 0;
                    let startNodeIdx = -1, endNodeIdx = -1;
                    let from = -1, to = -1;

                    for (let i = 0; i < textNodes.length; i++) {
                      const nodeEnd = cumPos + textNodes[i].text.length;
                      if (startNodeIdx === -1 && err.offset >= cumPos && err.offset < nodeEnd) {
                        startNodeIdx = i;
                        from = textNodes[i].pos + (err.offset - cumPos);
                      }
                      if (errEnd > cumPos && errEnd <= nodeEnd) {
                        endNodeIdx = i;
                        to = textNodes[i].pos + (errEnd - cumPos);
                        break;
                      }
                      cumPos = nodeEnd;
                    }

                    if (startNodeIdx === -1 || from === -1 || to === -1) continue;
                    const color = errorColors[err.type] || "gray";
                    const deco = (f: number, t: number) =>
                      Decoration.inline(f, t, {
                        style: `text-decoration: underline wavy ${color}; text-underline-offset: 4px;`,
                        class: "grammar-underline",
                      });

                    if (startNodeIdx === endNodeIdx) {
                      decos.push(deco(from, to));
                    } else {
                      decos.push(deco(from, textNodes[startNodeIdx].pos + textNodes[startNodeIdx].text.length));
                      for (let i = startNodeIdx + 1; i < endNodeIdx; i++) {
                        decos.push(deco(textNodes[i].pos, textNodes[i].pos + textNodes[i].text.length));
                      }
                      decos.push(deco(textNodes[endNodeIdx].pos, to));
                    }
                  }
                  return DecorationSet.create(doc, decos);
                },
              },
            }),
          ];
        },
      }),
      // Dark color override — only overrides dark inline colors in dark mode,
      // preserving intentional bright colors (red, blue, etc.).
      // isDarkColor() parses hex inline and caches results, so this decorations
      // callback (which runs on every transaction) never forces a layout/style
      // recalc — critical for INP while typing.
      Extension.create({
        name: "darkColorFix",
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey("dark-color-fix"),
              props: {
                decorations(state) {
                  if (!document.documentElement.classList.contains("dark")) return null;
                  const decos: Decoration[] = [];
                  state.doc.descendants((node, pos) => {
                    if (!node.isText) return;
                    const ts = node.marks.find(m => m.type.name === "textStyle");
                    if (!ts?.attrs.color) return;
                    if (isDarkColor(ts.attrs.color as string)) {
                      decos.push(Decoration.inline(pos, pos + node.nodeSize, {
                        style: "color: hsl(0 0% 96%) !important;",
                      }));
                    }
                  });
                  return decos.length ? DecorationSet.create(state.doc, decos) : null;
                },
              },
            }),
          ];
        },
      }),
    ],
    content: content || "",
    editable,
    onUpdate: ({ editor: ed }) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (!ed.isDestroyed) {
          onChange(ed.getHTML());
        }
      });
    },
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[60vh] font-serif text-lg leading-relaxed",
        "data-placeholder": placeholder || "Start writing...",
      },
      handleDOMEvents: {
        blur: () => { onBlur?.(); return false; },
      },
    },
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useImperativeHandle(ref, () => ({
    setContent: (html: string) => {
      if (editor && !editor.isDestroyed) editor.commands.setContent(html ?? "");
    },
    focus: () => {
      editor?.commands.focus();
    },
  }), [editor]);

  // Toolbar formatting state synced from editor events (avoids shouldRerenderOnTransaction).
  const [toolbarFmt, setToolbarFmt] = useState({
    fontFamily: "", fontSize: "", color: "#000000", highlightColor: "#ffff00",
    isBold: false, isItalic: false, isUnderline: false, isStrike: false, isHighlight: false,
    heading: 0,
    isBulletList: false, isOrderedList: false, isBlockquote: false, isCodeBlock: false,
    textAlign: "", isLink: false,
  });

  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      setToolbarFmt({
        fontFamily: editor.getAttributes("textStyle").fontFamily || "",
        fontSize: editor.getAttributes("textStyle").fontSize || "",
        color: editor.getAttributes("textStyle").color || "#000000",
        highlightColor: editor.getAttributes("highlight").color || "#ffff00",
        isBold: editor.isActive("bold"),
        isItalic: editor.isActive("italic"),
        isUnderline: editor.isActive("underline"),
        isStrike: editor.isActive("strike"),
        isHighlight: editor.isActive("highlight"),
        heading: editor.isActive("heading", { level: 1 }) ? 1 : editor.isActive("heading", { level: 2 }) ? 2 : editor.isActive("heading", { level: 3 }) ? 3 : 0,
        isBulletList: editor.isActive("bulletList"),
        isOrderedList: editor.isActive("orderedList"),
        isBlockquote: editor.isActive("blockquote"),
        isCodeBlock: editor.isActive("codeBlock"),
        textAlign: editor.isActive({ textAlign: "left" }) ? "left" : editor.isActive({ textAlign: "center" }) ? "center" : editor.isActive({ textAlign: "right" }) ? "right" : editor.isActive({ textAlign: "justify" }) ? "justify" : "",
        isLink: editor.isActive("link"),
      });
    };
    editor.on("selectionUpdate", sync);
    sync();
    return () => { editor.off("selectionUpdate", sync); };
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr);
  }, [editor, grammarErrors]);

  // Re-evaluate dark color decorations when the theme toggles
  useEffect(() => {
    if (!editor) return;
    const observer = new MutationObserver(() => {
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const throttleMs = 100;
    let lastCall = 0;
    let pendingId: number | undefined;
    const handler = () => {
      const now = performance.now();
      if (now - lastCall < throttleMs) {
        if (pendingId === undefined) {
          pendingId = requestAnimationFrame(() => {
            pendingId = undefined;
            lastCall = performance.now();
            try {
              const cb = onSelectionChangeRef.current;
              if (!cb) return;
              const sel = window.getSelection();
              if (!sel || sel.isCollapsed || !dom.contains(sel.anchorNode)) { cb(""); return; }
              cb(sel.toString());
            } catch { /* selection handler error */ }
          });
        }
        return;
      }
      lastCall = now;
      try {
        const cb = onSelectionChangeRef.current;
        if (!cb) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !dom.contains(sel.anchorNode)) { cb(""); return; }
        cb(sel.toString());
      } catch { /* selection handler error */ }
    };
    document.addEventListener("selectionchange", handler);
    return () => {
      document.removeEventListener("selectionchange", handler);
      if (pendingId !== undefined) cancelAnimationFrame(pendingId);
    };
  }, [editor]);

  const [showChartDialog, setShowChartDialog] = useState(false);

  const saveSelection = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    savedSelectionRef.current = { from, to };
  }, [editor]);

  const applyFontFamily = useCallback((v: string) => {
    if (!editor) return;
    const saved = savedSelectionRef.current;
    if (saved && saved.from !== saved.to) {
      editor.chain().focus().setTextSelection({ from: saved.from, to: saved.to }).setFontFamily(v).run();
    } else {
      editor.chain().focus().setFontFamily(v).run();
    }
    savedSelectionRef.current = null;
  }, [editor]);

  const applyFontSize = useCallback((v: string) => {
    if (!editor) return;
    const saved = savedSelectionRef.current;
    if (saved && saved.from !== saved.to) {
      editor.chain().focus().setTextSelection({ from: saved.from, to: saved.to }).setFontSize(v).run();
    } else {
      editor.chain().focus().setFontSize(v).run();
    }
    savedSelectionRef.current = null;
  }, [editor]);

  const insertChart = useCallback((configJson: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent({ type: "chart", attrs: { config: configJson } }).run();
  }, [editor]);

  const insertTable = useCallback((rows: number, cols: number) => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).scrollIntoView().run();
  }, [editor]);

  const expandColumn = useCallback(() => {
    if (!editor) return;
    const cellAttrs = editor.getAttributes("tableCell") || editor.getAttributes("tableHeader");
    if (!cellAttrs || !cellAttrs.colwidth) return;
    const newWidth = (cellAttrs.colwidth[0] || 80) + 60;
    editor.chain().focus().setCellAttribute("colwidth", [newWidth]).run();
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const url = prompt("Enter URL:");
    if (!url) return;
    // Allowlist safe schemes only; reject javascript:, data:, etc. (XSS).
    if (!isSafeUrl(url)) {
      alert("Only http, https, and mailto links are allowed.");
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const handleUploadClick = useCallback(() => {
    if (!editor) return;
    savedSelectionRef.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    imageInputRef.current?.click();
  }, [editor]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (savedSelectionRef.current) {
      const from = savedSelectionRef.current.from;
      editor.chain().focus().setTextSelection(from).run();
      savedSelectionRef.current = null;
    }

    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Upload failed"); }
      const data = await res.json();
      editor.chain().focus().setImage({ src: data.url }).run();
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = prompt("Enter image URL:");
    if (!url) return;
    // Allow http(s) and data: image URLs (uploads use data: URIs). Reject other
    // schemes — javascript:/data:text-html etc. are not valid <img> sources and
    // could be abused. Mirrors the setLink() allowlist check.
    let ok = false;
    try {
      const parsed = new URL(url);
      ok = parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      ok = /^data:image\//i.test(url.trim());
    }
    if (!ok) {
      alert("Only http(s) image URLs or uploaded images are allowed.");
      return;
    }
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div>
      {/* Toolbar */}
      {editable && (
      <div className="sticky top-0 z-10 bg-background flex items-center gap-0.5 py-2 mb-2 overflow-x-auto flex-nowrap scrollbar-thin border-b">
        <div id="tour-editor-undo" className="flex items-center gap-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        </div>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarSelect
          value={toolbarFmt.fontFamily}
          onChange={applyFontFamily}
          onMouseDown={saveSelection}
          options={fonts}
        />
        <ToolbarSelect
          value={toolbarFmt.fontSize}
          onChange={applyFontSize}
          onMouseDown={saveSelection}
          options={fontSizes}
        />
        <input
          type="color"
          value={toolbarFmt.color}
          onChange={e => editor.chain().focus().setColor(e.target.value).run()}
          className="w-6 h-6 p-0 border rounded cursor-pointer"
          title="Text Color"
        />
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={toolbarFmt.isBold} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={toolbarFmt.isItalic} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={toolbarFmt.isUnderline} title="Underline">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={toolbarFmt.isStrike} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
        <input
          type="color"
          value={toolbarFmt.highlightColor}
          onInput={e => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()}
          className="w-6 h-6 p-0 border rounded cursor-pointer"
          title="Highlight Color"
        />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={toolbarFmt.isHighlight} title="Highlight">
          <Highlighter className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={toolbarFmt.heading === 1} title="Heading 1">
          <Heading1 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={toolbarFmt.heading === 2} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={toolbarFmt.heading === 3} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={toolbarFmt.isBulletList} title="Bullet List">
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={toolbarFmt.isOrderedList} title="Numbered List">
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={toolbarFmt.isBlockquote} title="Blockquote">
          <Quote className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={toolbarFmt.isCodeBlock} title="Code Block">
          <FileCode className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
          <Minus className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={toolbarFmt.textAlign === "left"} title="Align Left">
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={toolbarFmt.textAlign === "center"} title="Center">
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={toolbarFmt.textAlign === "right"} title="Align Right">
          <AlignRight className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={toolbarFmt.textAlign === "justify"} title="Justify">
          <AlignJustify className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={setLink} active={toolbarFmt.isLink} title="Link">
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
        <ToolbarButton onClick={handleUploadClick} title="Upload Image">
          <Upload className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={addImage} title="Image URL">
          <ImageIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <TableGridPopover onInsert={insertTable} />
        <ToolbarButton onClick={() => setShowChartDialog(true)} title="Chart">
          <BarChart3 className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>
      )}

      {/* Editor */}
      <div>
        <EditorContent editor={editor} />
      </div>

      <ChartCreator
        open={showChartDialog}
        onOpenChange={setShowChartDialog}
        onInsert={insertChart}
      />

      <TableHandle editor={editor} />

      <style>{`
        .ProseMirror {
          color: hsl(var(--foreground));
        }
        .dark .ProseMirror {
          color: hsl(0 0% 96%);
        }
        .ProseMirror ul, .ProseMirror ol {
          list-style: revert;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .ProseMirror li {
          margin: 0.25em 0;
        }
        .ProseMirror ul ul, .ProseMirror ol ul,
        .ProseMirror ul ol, .ProseMirror ol ol {
          margin: 0;
        }
        .ProseMirror blockquote {
          border-left: 3px solid hsl(var(--border));
          padding-left: 1em;
          margin: 0.5em 0;
          color: hsl(var(--muted-foreground));
          font-style: italic;
        }
        .ProseMirror pre {
          background: hsl(var(--muted));
          border-radius: 0.375rem;
          padding: 0.75em 1em;
          font-family: monospace;
          overflow-x: auto;
          margin: 0.5em 0;
        }
        .ProseMirror hr {
          border: none;
          border-top: 2px solid hsl(var(--border));
          margin: 1em 0;
        }
        .ProseMirror table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 1em 0;
          overflow: hidden;
        }
        .ProseMirror td, .ProseMirror th {
          border: 2px solid hsl(var(--border));
          padding: 8px 12px;
          vertical-align: top;
          text-align: left;
          position: relative;
          min-width: 60px;
        }
        .ProseMirror th {
          background: hsl(var(--muted));
          font-weight: 600;
        }
        .ProseMirror .selectedCell {
          background: hsl(var(--accent) / 0.15);
        }
        .grammar-underline {
          text-decoration-skip-ink: none;
          text-decoration-thickness: 2px;
        }
      `}</style>
    </div>
  );
}

export default memo(forwardRef<RichTextEditorHandle, RichTextEditorProps>(RichTextEditor), (prev, next) => {
  return prev.onChange === next.onChange
    && prev.onBlur === next.onBlur
    && prev.placeholder === next.placeholder
    && prev.onSelectionChange === next.onSelectionChange
    && prev.grammarErrors === next.grammarErrors
    && prev.editable === next.editable;
});
