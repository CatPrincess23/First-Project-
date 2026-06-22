import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Rows3, Columns3, Trash2, Merge, Split, Maximize2, GripHorizontal,
} from "lucide-react";

interface TableHandleProps {
  editor: any;
}

export default function TableHandle({ editor }: TableHandleProps) {
  const [open, setOpen] = useState(false);
  const [tableRect, setTableRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const inTable = editor.isActive("table");
      if (!inTable) { setTableRect(null); setOpen(false); return; }
      const tableEl = editor.view.dom.querySelector(".ProseMirror table") as HTMLElement | null;
      if (tableEl) {
        const rect = tableEl.getBoundingClientRect();
        setTableRect(rect);
      }
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

  if (!tableRect) return null;

  return createPortal(
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed z-50 w-5 h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors cursor-pointer border border-background"
        style={{
          left: tableRect.left - 10,
          top: tableRect.top - 10,
        }}
        title="Table options"
      >
        <GripHorizontal className="w-3 h-3" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 p-1 rounded-lg border bg-popover text-popover-foreground shadow-lg"
          style={{
            left: tableRect.left,
            top: tableRect.top + 4,
          }}
        >
          <div className="grid grid-cols-2 gap-0.5">
            <button onClick={() => run(() => editor.chain().focus().addRowAfter().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left">
              <Rows3 className="w-3.5 h-3.5" /> Add Row
            </button>
            <button onClick={() => run(() => editor.chain().focus().addColumnAfter().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left">
              <Columns3 className="w-3.5 h-3.5" /> Add Col
            </button>
            <button onClick={() => run(() => editor.chain().focus().deleteRow().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left">
              <Trash2 className="w-3.5 h-3.5" /> Del Row
            </button>
            <button onClick={() => run(() => editor.chain().focus().deleteColumn().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left">
              <Trash2 className="w-3.5 h-3.5" /> Del Col
            </button>
            <button onClick={() => run(() => editor.chain().focus().mergeCells().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left">
              <Merge className="w-3.5 h-3.5" /> Merge
            </button>
            <button onClick={() => run(() => editor.chain().focus().splitCell().run())} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left">
              <Split className="w-3.5 h-3.5" /> Split
            </button>
          </div>
          <div className="border-t my-1" />
          <button onClick={() => {
            const cellAttrs = editor.getAttributes("tableCell") || editor.getAttributes("tableHeader");
            if (cellAttrs?.colwidth) {
              editor.chain().focus().setCellAttribute("colwidth", [(cellAttrs.colwidth[0] || 80) + 60]).run();
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
