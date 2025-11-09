import { v4 as uuid } from "uuid";
import {connectToDatabase as db} from "../config/database.config.js";
import * as net from "node:net";

async function data() {
    const database = await db();
    return database.collection('alerts');
}

export const getAlerts = async (req, res, next) => {
    try {
        const collection = await data();
        const alerts = await collection.find({}).toArray();
        res.status(200).json(alerts);
    } catch (error) {
        next(error);
    }
}

export const createAlert = async (req, res, next) => {
    try {
        const {title, message, date, relevance} = req.body;
        const id = uuid();
        const alert = {
            id,
            title,
            message,
            date,
            relevance
        }
    } catch (error) {
        next(error);
    }
}