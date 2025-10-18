import app from "./index.js";
import pool from "./config/database.config.js";
import "dotenv/config";
import { initializeDatabase } from "./config/init.database.js";

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Preparazione Database...");
    await initializeDatabase();

    //Start
    const server = app.listen(PORT, () => {
      console.log(`✓ Server avviato su porta ${PORT}`);
      console.log(`✓ Ambiente: ${process.env.NODE_ENV || "development"}`);
      console.log("✓ Database connesso");
    });
  } catch (error) {
    console.error("Errore nell'inizializzazione del server", error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM ricevuto. Chiusura graceful...");
  server.close(() => {
    console.log("Server chiuso");
    pool.end(() => {
      console.log("Pool database chiuso");
      process.exit(0);
    });
  });
});
