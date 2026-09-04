import { app } from "./app";
import { env } from "./config/env";
import { pool } from "./config/db";

const server = app.listen(env.port, () => console.log(`Urgent Medicine API listening on port ${env.port}`));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; starting graceful shutdown.`);
  server.close(async () => {
    try { await pool.end(); } finally { process.exit(0); }
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
