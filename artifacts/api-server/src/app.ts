import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";
import { loadUser } from "./middlewares/auth";
import { errorHandler } from "./lib/errors";

const app: Express = express();

// The app is served behind Replit's HTTPS proxy on the same origin as the frontend.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(loadUser);

app.use("/api", router);

app.use(errorHandler);

export default app;
