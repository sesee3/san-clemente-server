import express from "express";
import {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
} from "../controllers/events.data.js";
import { verifyToken } from "../middleware/auth.js";

import {
    getCelebrations,
    createCelebration,
    deleteCelebration,
    updateCelebration,
} from "../controllers/celebration.data.js";

const router = express.Router();

//EVEnts
router.get("/events", getEvents);
router.post("/events/add", verifyToken, createEvent);
router.put("/events/:id", verifyToken, updateEvent);
router.delete("/events/:id", verifyToken, deleteEvent);

//Celebrations
router.get("/celebrations", getCelebrations);
router.post("/celebrations/add", verifyToken, createCelebration);
router.put("/celebrations/:id", verifyToken, updateCelebration);
router.delete("/celebrations/:id", verifyToken, deleteCelebration);

export default router;
