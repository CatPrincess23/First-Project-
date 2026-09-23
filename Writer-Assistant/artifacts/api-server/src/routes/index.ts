import { Router, type IRouter, type Request, type Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import healthRouter from "./health";
import authRouter from "./auth";
import documentsRouter from "./documents";
import aiRouter from "./ai";
import worldRouter from "./world";
import uploadRouter from "./upload";
import conversationsRouter from "./conversations";
import importDocumentRouter from "./import-document";
import chaptersRouter from "./chapters";

const router: IRouter = Router();

// AI is paid; cap per resolved identity (falling back to IP). resolveIdentity
// runs globally in app.ts, so req.identity is populated by the time this fires.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, _res: Response) =>
    req.identity?.id ?? ipKeyGenerator(req.ip ?? "", 56),
});

// Identity-based limits are easy to reset by starting a fresh guest session.
// Keep an additional per-IP ceiling to protect the server-side provider key.
const aiIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, _res: Response) => ipKeyGenerator(req.ip ?? "", 56),
});

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/documents", documentsRouter);
router.use("/ai", aiIpLimiter, aiLimiter, aiRouter);
router.use("/world/:documentId/entities", worldRouter);
router.use("/upload", uploadRouter);
router.use("/conversations", conversationsRouter);
router.use("/import-document", importDocumentRouter);
// Chapter routes handle their own full paths (/documents/:id/chapters, /chapters/:id).
router.use(chaptersRouter);

export default router;
