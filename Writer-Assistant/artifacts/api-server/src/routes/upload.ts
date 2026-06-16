import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Cheap first pass on the client-provided Content-Type. The authoritative
    // check is magic-byte sniffing in the handler below. SVG is intentionally
    // excluded here (no reliable magic bytes; XSS vector as a data: URI).
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only image files (png, jpg, jpeg, gif, webp) are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  // Authoritative validation: sniff the actual bytes rather than trusting the
  // client-supplied mimetype. file-type returns undefined for text-based
  // formats like SVG, which rejects them as an XSS vector.
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected) {
    res.status(400).json({ error: "Unsupported or unrecognized image file" });
    return;
  }

  const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  if (!allowed.includes(detected.mime)) {
    res.status(400).json({ error: "Unsupported image type" });
    return;
  }

  const base64 = req.file.buffer.toString("base64");
  res.json({ url: `data:${detected.mime};base64,${base64}` });
});

export default router;
