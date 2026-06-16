import { Router } from "express";
import multer from "multer";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    if (allowed.includes(file.mimetype) || ext === "txt" || ext === "pdf" || ext === "docx") {
      cb(null, true);
    } else {
      cb(new Error("Only .txt, .pdf, and .docx files are allowed"));
    }
  },
});

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "txt";
  let text = "";

  try {
    if (ext === "txt") {
      text = req.file.buffer.toString("utf-8");
    } else if (ext === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;
    }

    const title = req.file.originalname.replace(/\.[^.]+$/, "");

    res.json({ text, title });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: "Failed to parse file" });
  }
});

export default router;
