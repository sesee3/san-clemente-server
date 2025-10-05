import pool from "../config/database.config.js";
import { v4 as uuidv4 } from "uuid";

export const createEvent = async (req, res, next) => {
  try {
    const { title, description, date, additionalNotes, endDate, image, type } =
      req.body;

    const id = uuidv4();
    const query = `
      INSERT INTO events (id, title, description, date, additionalNotes, endDate, image, type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `;

    const result = await pool.query(query, [
      id,
      title,
      description,
      date,
      additionalNotes,
      endDate,
      image,
      type,
    ]);

    res.status(201).json({
      message: "Evento aggiunto correttamente",
      post: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

export const getEvents = async (req, res, next) => {
  try {
    const query = `
      SELECT e.id, e.title, e.description, e.date, e.additionalNotes, e.endDate, e.image, e.type
      FROM events e
      ORDER BY e.date DESC
      LIMIT 100
      `;

    //TODO: Remove limit

    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
};
