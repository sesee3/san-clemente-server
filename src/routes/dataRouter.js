import express from "express";
import { createEvent, getEvents } from "../controllers/datasController.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

router.get("/events", getEvents);

router.post("/events/add", verifyToken, createEvent);

export default router;
