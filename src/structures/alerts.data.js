import { v4 as uuid } from "uuid";
import {connectToDatabase as db} from "../config/database.config.js";
import * as net from "node:net";
import {ObjectId} from "mongodb";

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

export const getAlertFromID = async (req, res, next) => {

    const { id } = req.params;

    try {
        const collection = await data();
        const alert = await collection.findOne({_id: new ObjectId(id)});
        //TODO: Add checking if there is an element and check id is not null
        res.status(200).json(alert);
    } catch (error) {
        next(error);
    }
}


export const createAlert = async (req, res, next) => {
    try {
        const {title, message, date, relevance} = req.body;
        const alert = {
            title,
            message,
            date,
            relevance
        }
        const collection = await data();
        await collection.insertOne(alert);
        res.status(200).json({ok: true, alert});
    } catch (error) {
        next(error);
    }
}

export const deleteAlert = async (req, res, next) => {
    try {
        const { id } = req.params;

        const collection = await data();
        const result = await collection.deleteOne({_id: new ObjectId(id)});
        if (result.deletedCount === 0) {
            return res.status(404).json({ok: false, message: 'Alert non trovato'});
        }
        res.status(200).json({ok: true, message: 'Alert eliminato correttamente'});
    } catch (error) {
        next(error);
    }
}