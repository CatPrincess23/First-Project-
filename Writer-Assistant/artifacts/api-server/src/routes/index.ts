import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import aiRouter from "./ai";
import worldRouter from "./world";
import uploadRouter from "./upload";
import conversationsRouter from "./conversations";
import importDocumentRouter from "./import-document";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/documents", documentsRouter);
router.use("/ai", aiRouter);
router.use("/world/:documentId/entities", worldRouter);
router.use("/upload", uploadRouter);
router.use("/conversations", conversationsRouter);
router.use("/import-document", importDocumentRouter);

export default router;
