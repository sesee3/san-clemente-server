import express from "express";
import { signup, signin } from "../structures/authController.js";
import { validateSignup } from "../middleware/validation.js";
import {verifyToken} from "../middleware/auth.js";

export const router = express.Router();

router.post("/signup", validateSignup, signup);
router.post("/signin", signin);

router.get("/verify", verifyToken);