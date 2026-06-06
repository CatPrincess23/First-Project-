import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import aiRouter from "./ai";
import worldRouter from "./world";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/documents", documentsRouter);
router.use("/ai", aiRouter);
router.use("/world/:documentId/entities", worldRouter);

export default router;
