process.title = "server-san-clemente-main";

// Surface unhandled errors early with context.
process.on("unhandledRejection", (reason, promise) => {
  // eslint-disable-next-line no-console
  console.error("[main] Unhandled Promise Rejection:", reason, { promise });
});

process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("[main] Uncaught Exception:", err);
});

let server;
try {
  // src/server.js handles dotenv, middleware, routes, and graceful shutdown.
  const { start } = require("./src/server");
  if (typeof start !== "function") {
    // eslint-disable-next-line no-console
    console.error(
      "[main] Failed to start: src/server.js does not export start()",
    );
    process.exit(1);
  }
  server = start();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[main] Failed to bootstrap server:", err);
  process.exit(1);
}

module.exports = server;
