import type { RequestHandler } from "express";
import type { User } from "@workspace/db";
import { getUserById, isUserUsable } from "../services/auth";
import { hasPermission, type Permission } from "../domain/permissions";
import { forbidden, unauthorized } from "../lib/errors";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Loads the signed-in user from the session onto req.user (if any). */
export const loadUser: RequestHandler = async (req, _res, next) => {
  try {
    if (req.session.userId) {
      const user = await getUserById(req.session.userId);
      if (user && (await isUserUsable(user))) {
        req.user = user;
      } else {
        req.session.destroy(() => {});
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

/** Blocks everything except password change until the initial password is replaced. */
export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.user?.mustChangePassword) return next(forbidden("password_change_required"));
  next();
};

export const requirePlatformOwner: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "platform_owner") return next(forbidden());
  next();
};

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!hasPermission(req.user, permission)) return next(forbidden());
    next();
  };
}

/**
 * Clinic users may only touch their own clinic. The clinic id comes from the route param
 * and must match the session user's clinic; platform owners never pass this check for
 * customer-facing data (they use owner-only routes instead).
 */
export const requireOwnClinic: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  const clinicId = Number(req.params["clinicId"]);
  if (!Number.isInteger(clinicId) || req.user.clinicId !== clinicId) return next(forbidden("wrong_clinic"));
  next();
};
