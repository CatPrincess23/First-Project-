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

const fonts = [
  "Serif", "Sans-Serif", "Monospace", "Georgia", "Times New Roman",
  "Arial", "Helvetica", "Courier New", "Verdana", "Trebuchet MS",
];

const fontSizes = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px"];

function ToolbarButton({ onClick, active, children, title, id }: {
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
}

function ToolbarSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-7 text-xs rounded border bg-background px-1.5 text-foreground"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

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
}

export interface RichTextEditorHandle {
  // Imperatively replace the editor's document. The `content` prop is only used
  // as the initial value (the memo comparator below intentionally skips content
  // changes to keep typing off the React render path), so external updates —
  // grammar apply, AI suggestion apply, version restore — must go through here.
  setContent: (html: string) => void;
  focus: () => void;
}

function RichTextEditor({ content, onChange, onBlur, placeholder, onSelectionChange, grammarErrors }: RichTextEditorProps, ref: React.Ref<RichTextEditorHandle>) {
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
            spelling: "red", grammar: "orange", style: "blue", punctuation: "purple",
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
    ],
    content: content || "",
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

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr);
  }, [editor, grammarErrors]);

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
          value={editor.getAttributes("textStyle").fontFamily || ""}
          onChange={v => editor.chain().focus().setFontFamily(v).run()}
          options={fonts}
        />
        <ToolbarSelect
          value={editor.getAttributes("textStyle").fontSize || ""}
          onChange={v => {
            if (v) editor.chain().focus().setFontSize(v).run();
          }}
          options={fontSizes}
        />
        <input
          type="color"
          value={editor.getAttributes("textStyle").color || "#000000"}
          onChange={e => editor.chain().focus().setColor(e.target.value).run()}
          className="w-6 h-6 p-0 border rounded cursor-pointer"
          title="Text Color"
        />
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
        <input
          type="color"
          value={editor.getAttributes("highlight").color || "#ffff00"}
          onInput={e => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()}
          className="w-6 h-6 p-0 border rounded cursor-pointer"
          title="Highlight Color"
        />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")} title="Highlight">
          <Highlighter className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
          <Heading1 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered List">
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
          <Quote className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code Block">
          <FileCode className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
          <Minus className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align Left">
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Center">
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align Right">
          <AlignRight className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })} title="Justify">
          <AlignJustify className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-border mx-1" />

        <ToolbarButton onClick={setLink} active={editor.isActive("link")} title="Link">
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
        <ToolbarButton onClick={handleUploadClick} title="Upload Image" id="tour-editor-upload">
          <Upload className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={addImage} title="Image URL">
          <ImageIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <TableGridPopover id="tour-editor-table" onInsert={insertTable} />
        <ToolbarButton onClick={() => setShowChartDialog(true)} title="Chart" id="tour-editor-chart">
          <BarChart3 className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>

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
        .dark .ProseMirror,
        .dark .ProseMirror * {
          color: hsl(40 10% 96%) !important;
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
    && prev.grammarErrors === next.grammarErrors;
});
