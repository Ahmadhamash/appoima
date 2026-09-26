import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const notFound = (code = "not_found") => new HttpError(404, code);
export const forbidden = (code = "forbidden") => new HttpError(403, code);
export const unauthorized = (code = "unauthorized") => new HttpError(401, code);
export const conflict = (code = "conflict") => new HttpError(409, code);
export const badRequest = (code = "bad_request") => new HttpError(400, code);

// Error codes are translated on the client. Never send raw internal messages.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation",
      issues: err.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message })),
    });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "internal" });
};
