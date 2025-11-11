import express from "express";
import {verifyToken} from "../middleware/auth.js";

import {
    getAlerts,
    createAlert,
    deleteAlert
} from "../structures/alerts.data.js";

export const router = express.Router();

//Alerts
router.get("/", getAlerts);
router.post("/add", verifyToken, createAlert);
router.delete("/delete/:id", verifyToken, deleteAlert)