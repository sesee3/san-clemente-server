import pg from "pg";
const { Pool } = pg;
import "dotenv/config";

const pool = new Pool({});

pool.on("error", (error) => {
  console.error("{POOL} error in PostgreSQL", error);
  process.exit(-1);
});

export default pool;
