import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

export async function exportToPDF(title: string, content: string): Promise<void> {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const margin = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;

  // Title
  pdf.setFont("times", "bold");
  pdf.setFontSize(20);
  const titleLines = pdf.splitTextToSize(title || "Untitled Document", usableWidth);
  pdf.text(titleLines, margin, margin + 10);

  // Separator
  let y = margin + 10 + titleLines.length * 8 + 6;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Content
  pdf.setFont("times", "normal");
  pdf.setFontSize(12);

  const paragraphs = content.split("\n");
  for (const para of paragraphs) {
    if (para.trim() === "") {
      y += 5;
      continue;
    }
    const lines = pdf.splitTextToSize(para, usableWidth);
    for (const line of lines) {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += 6.5;
    }
    y += 3;
  }

  pdf.save(`${(title || "document").replace(/[^a-z0-9]/gi, "_")}.pdf`);
}

export async function exportToDOCX(title: string, content: string): Promise<void> {
  const paragraphs = content.split("\n").filter(p => p !== undefined);

  const docParagraphs = [
    new Paragraph({
      text: title || "Untitled Document",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: "" }),
    ...paragraphs.map(text =>
      new Paragraph({
        children: [new TextRun({ text: text || "", font: "Times New Roman", size: 24 })],
        spacing: { after: text.trim() === "" ? 0 : 120 },
      })
    ),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children: docParagraphs }],
    creator: "WriteAI",
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
