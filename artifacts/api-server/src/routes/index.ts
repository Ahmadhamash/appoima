import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import clinicsRouter from "./clinics";
import setupRouter from "./setup";
import meRouter from "./me";
import schedulingRouter from "./scheduling";

import assistantRouter from './assistant';
import conciergeRouter from './concierge';
import operationsRouter from './operations';

import workspaceRouter from './workspace';

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(clinicsRouter);
router.use(meRouter);
router.use(workspaceRouter);
router.use(conciergeRouter);
router.use(assistantRouter);
router.use(operationsRouter);
router.use(schedulingRouter);
router.use(setupRouter);

export default router;
