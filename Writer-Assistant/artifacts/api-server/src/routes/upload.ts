import { Router } from "express";
import multer from "multer";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Only image files (png, jpg, jpeg, gif, webp, svg) are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const base64 = req.file.buffer.toString("base64");
  const mime = req.file.mimetype;
  res.json({ url: `data:${mime};base64,${base64}` });
});

export default router;
