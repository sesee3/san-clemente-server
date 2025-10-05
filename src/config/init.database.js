import pool from "./database.config.js";

export async function initializeDatabase() {
  // Crea tabella users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL
    );
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
  );

  // Crea tabella posts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      date TIMESTAMP,
      additionalNotes TEXT[],
      endDate TIMESTAMP,
      image TEXT,
      type TEXT
    );
  `);

  // Crea indice
  await pool.query("CREATE INDEX IF NOT EXISTS idx_events_ids ON events(id)");
}

export async function reset() {
  await clearEvents();
  await clearUsers();

  await initializeDatabase();
}

export async function clearUsers() {
  await pool.query("DROP TABLE IF EXISTS users CASCADE");
}

export async function clearEvents() {
  await pool.query("DROP TABLE IF EXISTS events CASCADE");
}
