import express from "express";
import {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
} from "../structures/events.data.js";
import { verifyToken } from "../middleware/auth.js";

import {
    getCelebrations,
    createCelebration,
    deleteCelebration,
    updateCelebration,
} from "../structures/celebration.data.js";


import {
    getAlerts,
    createAlert,
} from "../structures/alerts.data.js";

import {
    getTodayLectures,
    fetchLectures, fetchLectureOfDate, getLectureOfDate
} from "../structures/lectures.data.js";
import {getGroups} from "../structures/groups.data.js";

export const router = express.Router();

//Events
router.get("/events", getEvents);
router.post("/events/add", verifyToken, createEvent);
router.put("/events/:id", verifyToken, updateEvent);
router.delete("/events/:id", verifyToken, deleteEvent);

//Celebrations
router.get("/celebrations", getCelebrations);

//TODO: Add single celebration

router.post("/celebrations/add", verifyToken, createCelebration);
router.put("/celebrations/:id", verifyToken, updateCelebration);
router.delete("/celebrations/:id", verifyToken, deleteCelebration);


//Alerts
router.get("/alerts", getAlerts);
router.post("/alerts/add", verifyToken, createAlert);

//Groups
router.get("/groups", getGroups);
router.post("/groups/add", verifyToken, createAlert);
router.put("/groups/edit", verifyToken, createAlert);
router.delete("/groups/delete", verifyToken, createAlert);


//Lectures
router.get("/lecture/today", getTodayLectures);
router.get("/lecture/fetch/today", fetchLectures);

router.get("/lecture/:date", getLectureOfDate);
router.get("/lecture/fetch/:date", fetchLectureOfDate);
