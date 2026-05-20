import { Router, type IRouter } from "express";
import healthRouter from "./health";
import babiesRouter from "./babies";
import growthRouter from "./growth";
import productsRouter from "./products";
import subscriptionsRouter from "./subscriptions";
import ordersRouter from "./orders";
import dashboardRouter from "./dashboard";
import approvedSkusRouter from "./approvedSkus";
import adminRouter from "./admin";
import stripeRouter from "./stripe";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/babies", babiesRouter);
router.use("/babies/:id/growth", growthRouter);
router.use("/products", productsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/orders", ordersRouter);
router.use("/dashboard", dashboardRouter);
router.use("/approved-skus", approvedSkusRouter);
router.use("/stripe", stripeRouter);

export default router;
