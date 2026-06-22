import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, LineChart, PieChart, TrendingUp, Plus, Trash2 } from "lucide-react";

type ChartType = "bar" | "line" | "pie" | "area";

interface DataRow {
  label: string;
  value: string;
}

const CHART_TYPES: { type: ChartType; icon: typeof BarChart3; label: string }[] = [
  { type: "bar", icon: BarChart3, label: "Bar" },
  { type: "line", icon: TrendingUp, label: "Line" },
  { type: "pie", icon: PieChart, label: "Pie" },
  { type: "area", icon: LineChart, label: "Area" },
];

interface ChartCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (configJson: string) => void;
}

export default function ChartCreator({ open, onOpenChange, onInsert }: ChartCreatorProps) {
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<DataRow[]>([
    { label: "Category A", value: "30" },
    { label: "Category B", value: "50" },
    { label: "Category C", value: "20" },
  ]);
  const [datasetLabel, setDatasetLabel] = useState("Values");

  const addRow = () => setRows(prev => [...prev, { label: "", value: "" }]);

  const removeRow = (i: number) => {
    if (rows.length <= 2) return;
    setRows(prev => prev.filter((_, idx) => idx !== i));
  };

  const updateRow = (i: number, field: keyof DataRow, val: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  };

  const handleInsert = () => {
    const validRows = rows.filter(r => r.label.trim() && r.value.trim());
    if (validRows.length < 2) return;

    const config = {
      type: chartType,
      title,
      labels: validRows.map(r => r.label.trim()),
      datasets: [{ label: datasetLabel || "Values", data: validRows.map(r => parseFloat(r.value) || 0) }],
    };

    onInsert(JSON.stringify(config));
    onOpenChange(false);
  };

  const canInsert = rows.filter(r => r.label.trim() && r.value.trim()).length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Insert Chart
          </DialogTitle>
        </DialogHeader>

        {/* Chart type selector */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Chart Type</Label>
          <div className="grid grid-cols-4 gap-2">
            {CHART_TYPES.map(({ type, icon: Icon, label }) => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-xs ${
                  chartType === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Title (optional)</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Chart title..."
            className="text-sm"
          />
        </div>

        {/* Dataset label */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Dataset Label</Label>
          <Input
            value={datasetLabel}
            onChange={e => setDatasetLabel(e.target.value)}
            placeholder="e.g. Sales, Population, Score..."
            className="text-sm"
          />
        </div>

        {/* Data rows */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground">Data</Label>
            <Button variant="ghost" size="sm" onClick={addRow} className="h-6 text-xs gap-1">
              <Plus className="w-3 h-3" /> Add Row
            </Button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={row.label}
                  onChange={e => updateRow(i, "label", e.target.value)}
                  placeholder="Label"
                  className="text-sm h-8 flex-1"
                />
                <Input
                  type="number"
                  value={row.value}
                  onChange={e => updateRow(i, "value", e.target.value)}
                  placeholder="Value"
                  className="text-sm h-8 w-24"
                  step="any"
                />
                <button
                  onClick={() => removeRow(i)}
                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-30"
                  disabled={rows.length <= 2}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleInsert} disabled={!canInsert}>Insert Chart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
