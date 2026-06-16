import { Router, type IRouter, type Request, type Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import healthRouter from "./health";
import authRouter from "./auth";
import documentsRouter from "./documents";
import aiRouter from "./ai";
import worldRouter from "./world";
import uploadRouter from "./upload";
import conversationsRouter from "./conversations";
import { requireIdentity } from "../middlewares/identity";

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

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/documents", requireIdentity, documentsRouter);
router.use("/ai", aiLimiter, requireIdentity, aiRouter);
router.use("/world/:documentId/entities", requireIdentity, worldRouter);
router.use("/upload", requireIdentity, uploadRouter);
router.use("/conversations", requireIdentity, conversationsRouter);

export default router;
