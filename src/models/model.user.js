import pool from "../config/database.config.js";
import { v4 as uuidv4 } from "uuid";

class User {
  static async create(username, password) {
    const id = uuidv4();
    const query = `INSERT INTO users (id, username, password) VALUES ($1, $2, $3) RETURNING id, username`;

    const values = [id, username, password];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findByName(username) {
    const query = "SELECT * FROM users WHERE username = $1";
    const result = await pool.query(query, [username]);
    return result.rows[0];
  }

  static async findByID(id) {
    const query = "SELECT * FROM users WHERE id = $1";
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

export default User;
