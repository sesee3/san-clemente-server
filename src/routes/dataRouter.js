import express from "express";
import {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
} from "../controllers/datasController.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// Visualizza tutti gli eventi
router.get("/events", getEvents);

// Aggiungi un nuovo evento
router.post("/events/add", verifyToken, createEvent);

// Modifica un evento esistente
router.put("/events/:id", verifyToken, updateEvent);

// Elimina un evento
router.delete("/events/:id", verifyToken, deleteEvent);

export default router;
