import jsPDF from "jspdf";
import {
  Document, Packer, Paragraph, TextRun,
  HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle,
} from "docx";

interface TableData {
  headers: string[];
  rows: string[][];
}

interface ChartData {
  type: string;
  title: string;
  labels: string[];
  datasets: { label: string; data: number[] }[];
}

type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "heading3"; text: string }
  | { type: "table"; table: TableData }
  | { type: "chart"; chart: ChartData }
  | { type: "hr" }
  | { type: "list"; items: string[]; ordered: boolean };

function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function parseTable(el: HTMLTableElement): TableData {
  const headers: string[] = [];
  const rows: string[][] = [];
  const trs = el.querySelectorAll("tr");
  let first = true;
  for (const tr of trs) {
    const cells: string[] = [];
    const cellEls = tr.querySelectorAll("td, th");
    for (const cell of cellEls) {
      cells.push(decodeHtmlEntities(cell.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    }
    if (first && el.querySelector("th")) {
      headers.push(...cells);
      first = false;
    } else {
      if (headers.length === 0) {
        if (first) { headers.push(...cells); first = false; continue; }
      }
      rows.push(cells);
    }
  }
  return { headers, rows };
}

function parseContent(html: string): ContentBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const blocks: ContentBlock[] = [];

  for (const node of doc.body.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push({ type: "paragraph", text });
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case "p": {
        const text = el.textContent?.trim();
        if (text) blocks.push({ type: "paragraph", text: decodeHtmlEntities(text) });
        break;
      }
      case "h1":
      case "h2":
      case "h3": {
        const text = el.textContent?.trim();
        if (!text) break;
        const map: Record<string, "heading1" | "heading2" | "heading3"> = { h1: "heading1", h2: "heading2", h3: "heading3" };
        blocks.push({ type: map[tag], text: decodeHtmlEntities(text) });
        break;
      }
      case "table":
        blocks.push({ type: "table", table: parseTable(el as HTMLTableElement) });
        break;
      case "hr":
        blocks.push({ type: "hr" });
        break;
      case "ul":
      case "ol": {
        const items: string[] = [];
        for (const li of el.querySelectorAll("li")) {
          const text = li.textContent?.trim();
          if (text) items.push(decodeHtmlEntities(text));
        }
        blocks.push({ type: "list", items, ordered: tag === "ol" });
        break;
      }
      case "blockquote": {
        const text = el.textContent?.trim();
        if (text) blocks.push({ type: "paragraph", text: decodeHtmlEntities(text) });
        break;
      }
      case "pre": {
        const text = el.textContent?.trim();
        if (text) blocks.push({ type: "paragraph", text: decodeHtmlEntities(text) });
        break;
      }
      default: {
        if (tag === "div" && el.getAttribute("data-chart-type") === "chart") {
          const configStr = el.getAttribute("data-chart-config");
          if (configStr) {
            try {
              blocks.push({ type: "chart", chart: JSON.parse(configStr) });
            } catch { /* skip invalid chart */ }
          }
        } else {
          const text = el.textContent?.trim();
          if (text) blocks.push({ type: "paragraph", text: decodeHtmlEntities(text) });
        }
      }
    }
  }
  return blocks;
}

function chartToTableData(chart: ChartData): TableData {
  const headers = ["Label", ...chart.datasets.map(d => d.label)];
  const rows = chart.labels.map((label, i) => [
    label,
    ...chart.datasets.map(d => String(d.data[i] ?? "")),
  ]);
  return { headers, rows };
}

// ---------- PDF ----------

function drawTableInPDF(pdf: jsPDF, table: TableData, x: number, y: number, w: number, lineH: number): number {
  const cellPad = 2;
  const colCount = table.headers.length || (table.rows[0]?.length || 1);
  const colW = w / colCount;
  let yy = y;

  const drawRow = (cells: string[], isHeader: boolean) => {
    const rowH = Math.max(
      lineH,
      ...cells.map((c, i) => {
        const lines = pdf.splitTextToSize(c, colW - cellPad * 2);
        return lines.length * lineH;
      })
    );
    for (let i = 0; i < cells.length; i++) {
      const cx = x + i * colW;
      pdf.setDrawColor(180, 180, 180);
      pdf.rect(cx, yy, colW, rowH);
      if (isHeader) {
        pdf.setFillColor(240, 240, 240);
        pdf.rect(cx, yy, colW, rowH, "F");
      }
      pdf.setFont("times", isHeader ? "bold" : "normal");
      pdf.setFontSize(9);
      const lines = pdf.splitTextToSize(cells[i], colW - cellPad * 2);
      for (let j = 0; j < lines.length; j++) {
        pdf.text(String(lines[j]), cx + cellPad, yy + lineH * (j + 1) - 1);
      }
    }
    yy += rowH;
  };

  if (table.headers.length) drawRow(table.headers, true);
  for (const row of table.rows) drawRow(row, false);

  return yy;
}

async function exportToPDF(title: string, content: string): Promise<void> {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const margin = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const lineH = 5;

  const addPageIfNeeded = (nextY: number) => {
    if (nextY > pageHeight - margin) {
      pdf.addPage();
      return margin;
    }
    return nextY;
  };

  let y = margin;

  // Title
  pdf.setFont("times", "bold");
  pdf.setFontSize(20);
  const titleLines = pdf.splitTextToSize(title || "Untitled Document", usableWidth);
  pdf.text(titleLines, margin, y + 10);
  y += titleLines.length * 8 + 6;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 8;

  const blocks = parseContent(content);

  pdf.setFont("times", "normal");
  pdf.setFontSize(12);

  for (const block of blocks) {
    switch (block.type) {
      case "heading1": {
        y = addPageIfNeeded(y + 10);
        pdf.setFont("times", "bold");
        pdf.setFontSize(16);
        const hLines = pdf.splitTextToSize(block.text, usableWidth);
        for (const hl of hLines) {
          y = addPageIfNeeded(y + lineH);
          pdf.text(String(hl), margin, y);
          y += lineH + 1;
        }
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        y += 2;
        break;
      }
      case "heading2": {
        y = addPageIfNeeded(y + 8);
        pdf.setFont("times", "bold");
        pdf.setFontSize(14);
        const hLines = pdf.splitTextToSize(block.text, usableWidth);
        for (const hl of hLines) {
          y = addPageIfNeeded(y + lineH);
          pdf.text(String(hl), margin, y);
          y += lineH + 1;
        }
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        y += 2;
        break;
      }
      case "heading3": {
        y = addPageIfNeeded(y + 6);
        pdf.setFont("times", "bold");
        pdf.setFontSize(12);
        const hLines = pdf.splitTextToSize(block.text, usableWidth);
        for (const hl of hLines) {
          y = addPageIfNeeded(y + lineH);
          pdf.text(String(hl), margin, y);
          y += lineH;
        }
        pdf.setFont("times", "normal");
        y += 2;
        break;
      }
      case "paragraph": {
        if (!block.text.trim()) { y += 5; break; }
        const lines = pdf.splitTextToSize(block.text, usableWidth);
        for (const l of lines) {
          y = addPageIfNeeded(y + lineH);
          pdf.text(String(l), margin, y);
          y += lineH;
        }
        y += 2;
        break;
      }
      case "table": {
        y = addPageIfNeeded(y + 3);
        const estimatedHeight = (1 + block.table.rows.length) * (lineH * 2);
        y = addPageIfNeeded(y + estimatedHeight);
        y = drawTableInPDF(pdf, block.table, margin, y, usableWidth, lineH);
        y += 4;
        break;
      }
      case "chart": {
        const dataTable = chartToTableData(block.chart);
        if (block.chart.title) {
          y = addPageIfNeeded(y + 6);
          pdf.setFont("times", "italic");
          pdf.setFontSize(10);
          pdf.text(block.chart.title + " (chart data)", margin, y);
          pdf.setFont("times", "normal");
          pdf.setFontSize(12);
          y += lineH + 2;
        }
        const estimatedHeight = (1 + dataTable.rows.length) * (lineH * 2);
        y = addPageIfNeeded(y + estimatedHeight);
        y = drawTableInPDF(pdf, dataTable, margin, y, usableWidth, lineH);
        y += 4;
        break;
      }
      case "hr": {
        y = addPageIfNeeded(y + 4);
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 8;
        break;
      }
      case "list": {
        for (let i = 0; i < block.items.length; i++) {
          const prefix = block.ordered ? `${i + 1}. ` : "• ";
          const text = prefix + block.items[i];
          const lines = pdf.splitTextToSize(text, usableWidth);
          for (const l of lines) {
            y = addPageIfNeeded(y + lineH);
            pdf.text(String(l), margin, y);
            y += lineH;
          }
        }
        y += 2;
        break;
      }
    }
  }

  pdf.save(`${(title || "document").replace(/[^a-z0-9]/gi, "_")}.pdf`);
}

// ---------- DOCX ----------

function buildDocxBlocks(blocks: ContentBlock[]) {
  const children: (Paragraph | Table)[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading1":
        children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 }));
        break;
      case "heading2":
        children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 }));
        break;
      case "heading3":
        children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3 }));
        break;
      case "paragraph":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, font: "Times New Roman", size: 24 })],
            spacing: { after: 120 },
          })
        );
        break;
      case "table": {
        const cols = block.table.headers.length || (block.table.rows[0]?.length || 1);
        const rows: TableRow[] = [];

        if (block.table.headers.length) {
          rows.push(
            new TableRow({
              tableHeader: true,
              children: block.table.headers.map(h =>
                new TableCell({
                  children: [new Paragraph({ text: h, alignment: AlignmentType.CENTER })],
                  shading: { type: "clear", fill: "F0F0F0" },
                })
              ),
            })
          );
        }

        for (const row of block.table.rows) {
          rows.push(
            new TableRow({
              children: row.map(c =>
                new TableCell({
                  children: [new Paragraph({ text: c, alignment: AlignmentType.LEFT })],
                })
              ),
            })
          );
        }

        children.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        children.push(new Paragraph({ text: "" }));
        break;
      }
      case "chart": {
        const dataTable = chartToTableData(block.chart);
        if (block.chart.title) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: block.chart.title + " (chart data)", font: "Times New Roman", size: 20, italics: true })],
              spacing: { after: 60 },
            })
          );
        }

        const cols = dataTable.headers.length || (dataTable.rows[0]?.length || 1);
        const rows: TableRow[] = [];

        if (dataTable.headers.length) {
          rows.push(
            new TableRow({
              tableHeader: true,
              children: dataTable.headers.map(h =>
                new TableCell({
                  children: [new Paragraph({ text: h, alignment: AlignmentType.CENTER })],
                  shading: { type: "clear", fill: "F0F0F0" },
                })
              ),
            })
          );
        }

        for (const row of dataTable.rows) {
          rows.push(
            new TableRow({
              children: row.map(c =>
                new TableCell({
                  children: [new Paragraph({ text: c, alignment: AlignmentType.LEFT })],
                })
              ),
            })
          );
        }

        children.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        children.push(new Paragraph({ text: "" }));
        break;
      }
      case "hr":
        children.push(new Paragraph({ text: "" }));
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "─".repeat(50), font: "Times New Roman", size: 12 })],
          })
        );
        children.push(new Paragraph({ text: "" }));
        break;
      case "list": {
        for (let i = 0; i < block.items.length; i++) {
          const prefix = block.ordered ? `${i + 1}. ` : "• ";
          children.push(
            new Paragraph({
              children: [new TextRun({ text: prefix + block.items[i], font: "Times New Roman", size: 24 })],
              spacing: { after: 60 },
            })
          );
        }
        children.push(new Paragraph({ text: "" }));
        break;
      }
    }
  }

  return children;
}

async function exportToDOCX(title: string, content: string): Promise<void> {
  const blocks = parseContent(content);

  const docChildren = [
    new Paragraph({
      text: title || "Untitled Document",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: "" }),
    ...buildDocxBlocks(blocks),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children: docChildren }],
    creator: "Whimsical Writer",
    title: title,
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(title || "document").replace(/[^a-z0-9]/gi, "_")}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

export { exportToPDF, exportToDOCX };
