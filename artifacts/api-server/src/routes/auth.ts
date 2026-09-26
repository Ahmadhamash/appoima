import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  authenticate,
  changeOwnPassword,
  createPlatformOwner,
  platformOwnerExists,
  toSessionUser,
} from "../services/auth";
import { requireAuth } from "../middlewares/auth";
import { recordAudit } from "../services/audit";

const router: IRouter = Router();

/** Slows down password guessing: 20 credential attempts per IP per 15 minutes. */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  handler: (_req, res) => res.status(429).json({ error: "too_many_attempts" }),
});

const passwordSchema = z.string().min(10).max(200);
const emailSchema = z.string().trim().email().max(200);

// ---- First-run setup -------------------------------------------------------

router.get("/setup/status", async (_req, res, next) => {
  try {
    res.json({ needsSetup: !(await platformOwnerExists()) });
  } catch (err) {
    next(err);
  }
});

const setupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});

router.post("/setup", credentialLimiter, async (req, res, next) => {
  try {
    const input = setupSchema.parse(req.body);
    const user = await createPlatformOwner(input);
    await recordAudit({ actorUserId: user.id, action: "platform.setup_completed", entityType: "user", entityId: user.id });
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      res.status(201).json({ user: toSessionUser(user) });
    });
  } catch (err) {
    next(err);
  }
});

// ---- Sign in / out ---------------------------------------------------------

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

router.post("/auth/login", credentialLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await authenticate(input.email, input.password);
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      res.json({ user: toSessionUser(user) });
    });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("jormall.sid");
    res.status(204).end();
  });
});

router.get("/auth/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.json({ user: toSessionUser(req.user) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

router.post("/auth/change-password", requireAuth, async (req, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    await changeOwnPassword(req.user!, input.currentPassword, input.newPassword);
    const updated = { ...req.user!, mustChangePassword: false };
    res.json({ user: toSessionUser(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
