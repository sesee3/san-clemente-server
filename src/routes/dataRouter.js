import express from "express";
import { createEvent, getEvents } from "../controllers/events.data.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

router.get("/data/events", getEvents);

router.post("/data/events/add", verifyToken, createEvent);

export default router;
