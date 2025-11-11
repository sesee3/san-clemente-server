import express from "express";
import { connectToDatabase as db } from "../config/database.config.js";

//Get beta features, only for admins.