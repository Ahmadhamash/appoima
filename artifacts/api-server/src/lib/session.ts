import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

const PgStore = connectPgSimple(session);

const secret = process.env["SESSION_SECRET"];
if (!secret) {
  throw new Error("SESSION_SECRET must be set");
}

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

export const sessionMiddleware = session({
  store: new PgStore({ pool, tableName: "session", createTableIfMissing: false }),
  name: "jormall.sid",
  secret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: "auto",
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
  },
});
