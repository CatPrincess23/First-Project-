import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Trash2, Rows3, Columns3, Merge, Split, Maximize2, MoreHorizontal, Table2,
} from "lucide-react";

interface TableHandleProps {
  editor: any;
}

function getActiveRowRect(editor: any): DOMRect | null {
  const dom = editor.view.dom;
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return null;
  const el = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
  if (!el) return null;
  const cell = (el as Element).closest("td, th");
  if (!cell) return null;
  const row = cell.closest("tr");
  if (!row) return null;
  return row.getBoundingClientRect();
}

export default function TableHandle({ editor }: TableHandleProps) {
  const [open, setOpen] = useState(false);
  const [rowRect, setRowRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const inTable = editor.isActive("table");
      if (!inTable) { setRowRect(null); setOpen(false); return; }
      const rect = getActiveRowRect(editor);
      setRowRect(rect);
    };
    update();
    editor.on("selectionUpdate", update);
    return () => { editor.off("selectionUpdate", update); };
  }, [editor]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
    editor.commands.focus();
  };

  if (!rowRect) return null;

  return createPortal(
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed z-50 w-5 h-8 flex items-center justify-center rounded-l-md bg-card border border-r-0 border-border shadow-sm hover:bg-muted transition-colors cursor-pointer opacity-80 hover:opacity-100"
        style={{
          left: rowRect.left - 5,
          top: rowRect.top + 2,
        }}
        title="Row options"
      >
        <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="fixed z-50 w-44 p-1 rounded-lg border bg-popover text-popover-foreground shadow-lg"
          style={{
            left: rowRect.left - 5,
            top: rowRect.top + 10,
          }}
        >
          <button onClick={() => run(() => editor.chain().focus().deleteTable().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left w-full text-destructive">
            <Table2 className="w-3.5 h-3.5" /> Delete Table
          </button>
          <div className="border-t my-1" />
          <button onClick={() => run(() => editor.chain().focus().deleteRow().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left w-full text-destructive">
            <Trash2 className="w-3.5 h-3.5" /> Delete Row
          </button>
          <button onClick={() => run(() => editor.chain().focus().deleteColumn().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left w-full text-destructive">
            <Trash2 className="w-3.5 h-3.5" /> Delete Column
          </button>
          <div className="border-t my-1" />
          <button onClick={() => run(() => editor.chain().focus().addRowAfter().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left w-full">
            <Rows3 className="w-3.5 h-3.5" /> Insert Row Below
          </button>
          <button onClick={() => run(() => editor.chain().focus().addColumnAfter().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left w-full">
            <Columns3 className="w-3.5 h-3.5" /> Insert Column Right
          </button>
          <div className="border-t my-1" />
          <button onClick={() => run(() => editor.chain().focus().mergeCells().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left w-full">
            <Merge className="w-3.5 h-3.5" /> Merge Cells
          </button>
          <button onClick={() => run(() => editor.chain().focus().splitCell().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left w-full">
            <Split className="w-3.5 h-3.5" /> Split Cell
          </button>
          <button onClick={() => {
            const attrs = editor.getAttributes("tableCell") || editor.getAttributes("tableHeader");
            if (attrs?.colwidth) {
              editor.chain().focus().setCellAttribute("colwidth", [(attrs.colwidth[0] || 80) + 60]).run();
            }
            setOpen(false);
            editor.commands.focus();
          }} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left w-full">
            <Maximize2 className="w-3.5 h-3.5" /> Expand Column
          </button>
        </div>
      )}
    </>,
    document.body
  );
}
