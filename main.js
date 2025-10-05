require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const PORT = 3000;

const app = express();
app.use((req, res, next) => {
  req.is = uuidv4();
  next();
});

//TODO: Add security Middleware with Helmet

app.get("/v1/health", (req, res) => {
  res.json({
    ok: true,
  });
});

function start() {
  const server = app.listen(PORT, () => {
    console.log("Server started");
  });

  server.setTimeout(12000);
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  const shutdown = (signal) => {
    console.log("Grasfully shutting down server");
    server.close((error) => {
      if (error) {
        console.error("Error in shutting down the server", error);
        process.exit(1);
      }
      console.log("Closed out connections");
      process.exit(0);
    });

    setTimeout(() => {
      console.warn("Forcing shutdown after timout");
      process.exit(1);
    }, 10000).unref();
  };
  return server;
}

module.exports = { app, start };
if (require.main === module) {
  start();
}
