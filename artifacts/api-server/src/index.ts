import app from "./app";
import { verifyInventoryGuards } from "./services/inventory";
import { verifySchedulingGuards } from "./services/scheduling";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "5000";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
const host = process.env["HOST"] ?? "0.0.0.0";

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await verifySchedulingGuards();
await verifyInventoryGuards();
app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");
});
