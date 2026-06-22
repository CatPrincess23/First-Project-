import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export interface ChartConfigData {
  type: "bar" | "line" | "pie" | "area";
  title: string;
  labels: string[];
  datasets: { label: string; data: number[]; color?: string }[];
}

function ChartNodeComponent({ node, selected, deleteNode }: ReactNodeViewProps) {
  const attrs = node.attrs as { config?: string };
  let config: ChartConfigData | null = null;
  try {
    if (attrs.config) config = JSON.parse(attrs.config);
  } catch { /* invalid JSON */ }

  if (!config || !config.labels?.length || !config.datasets?.length) return null;

  const chartData = config.labels.map((label, i) => {
    const row: Record<string, string | number> = { name: label };
    config!.datasets.forEach(ds => { row[ds.label] = ds.data[i] ?? 0; });
    return row;
  });

  const chartConfig = config.datasets.reduce((acc, ds, i) => {
    const color = ds.color || COLORS[i % COLORS.length];
    acc[ds.label] = { label: ds.label, color };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  const renderChart = () => {
    switch (config!.type) {
      case "bar":
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend />
            {config!.datasets.map((ds, i) => (
              <Bar key={ds.label} dataKey={ds.label} fill={ds.color || COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );
      case "line":
        return (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend />
            {config!.datasets.map((ds, i) => (
              <Line key={ds.label} type="monotone" dataKey={ds.label} stroke={ds.color || COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
            ))}
          </LineChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData}
              dataKey={Object.keys(chartData[0] || {})[1] || "value"}
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend />
          </PieChart>
        );
      case "area":
        return (
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend />
            {config!.datasets.map((ds, i) => (
              <Area key={ds.label} type="monotone" dataKey={ds.label} stroke={ds.color || COLORS[i % COLORS.length]} fill={ds.color || COLORS[i % COLORS.length]} fillOpacity={0.2} strokeWidth={2} />
            ))}
          </AreaChart>
        );
    }
  };

  return (
    <div
      contentEditable={false}
      className={`relative my-4 p-4 rounded-lg border-2 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border bg-card"}`}
    >
      {config.title && (
        <h4 className="text-sm font-medium text-center mb-3 text-foreground">{config.title}</h4>
      )}
      <ChartContainer config={chartConfig} className="w-full aspect-video max-h-[350px]">
        <ResponsiveContainer>
          {renderChart()}
        </ResponsiveContainer>
      </ChartContainer>
      {selected && (
        <button
          onClick={deleteNode}
          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-destructive/90 transition-colors"
          title="Delete chart"
        >
          ×
        </button>
      )}
    </div>
  );
}

export const ChartExtension = Node.create({
  name: "chart",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      config: { default: JSON.stringify({ type: "bar", title: "", labels: [], datasets: [{ label: "Values", data: [] }] }) },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-chart-type="chart"]' }];
  },

  renderHTML({ node }) {
    return [
      "div",
      { "data-chart-type": "chart", "data-chart-config": node.attrs.config },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeComponent);
  },
});
