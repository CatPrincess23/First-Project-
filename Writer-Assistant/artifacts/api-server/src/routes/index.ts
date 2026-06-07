import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import aiRouter from "./ai";
import worldRouter from "./world";
import uploadRouter from "./upload";
import conversationsRouter from "./conversations";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/documents", documentsRouter);
router.use("/ai", aiRouter);
router.use("/world/:documentId/entities", worldRouter);
router.use("/upload", uploadRouter);
router.use("/conversations", conversationsRouter);

export default router;
