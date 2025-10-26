import app from "./index.js";
import "dotenv/config";

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`✓ Server avviato su porta ${PORT}`);
  console.log(`✓ Ambiente: ${process.env.NODE_ENV || "development"}`);
  console.log("✓ Database connesso");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM ricevuto. Chiusura graceful...");
  server.close(() => {
    console.log("Server chiuso");
    process.exit(0);
  });
});
