import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table2 } from "lucide-react";

const MAX_COLS = 10;
const MAX_ROWS = 10;

interface TableGridPopoverProps {
  onInsert: (rows: number, cols: number) => void;
  id?: string;
}

export default function TableGridPopover({ onInsert, id }: TableGridPopoverProps) {
  const [hoveredCols, setHoveredCols] = useState(0);
  const [hoveredRows, setHoveredRows] = useState(0);
  const [open, setOpen] = useState(false);

  const handleSelect = () => {
    if (hoveredRows > 0 && hoveredCols > 0) {
      onInsert(hoveredRows, hoveredCols);
      setOpen(false);
      setHoveredCols(0);
      setHoveredRows(0);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
          title="Insert Table"
        >
          <Table2 className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" side="bottom">
        <div
          onMouseLeave={() => { setHoveredCols(0); setHoveredRows(0); }}
          className="select-none"
        >
          <div
            className="grid gap-[1px]"
            style={{
              gridTemplateColumns: `repeat(${MAX_COLS}, 16px)`,
            }}
          >
            {Array.from({ length: MAX_ROWS }, (_, r) =>
              Array.from({ length: MAX_COLS }, (_, c) => {
                const isHovered = r < hoveredRows && c < hoveredCols;
                return (
                  <div
                    key={`${r}-${c}`}
                    onMouseEnter={() => { setHoveredCols(c + 1); setHoveredRows(r + 1); }}
                    onClick={handleSelect}
                    className={`border cursor-pointer rounded-sm transition-colors ${
                      isHovered
                        ? "bg-primary/20 border-primary"
                        : "bg-muted border-border hover:border-muted-foreground"
                    }`}
                    style={{ width: 16, height: 16 }}
                  />
                );
              })
            )}
          </div>
          <div className="text-xs text-center text-muted-foreground mt-1.5">
            {hoveredRows > 0 && hoveredCols > 0
              ? `${hoveredRows} × ${hoveredCols}`
              : "Select size"}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
