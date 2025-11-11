import {v4 as uuid} from 'uuid';
import {connectToDatabase as db} from "../config/database.config.js";
import { ObjectId } from "mongodb";

async function data() {
    const database = await db();
    return database.collection('celebrations');
}

//GET
export const getCelebrations = async (req, res, next) => {
    try {
        const collection = await data();
        const celebrations = await collection.find({}).toArray();
        res.status(200).json(celebrations);
    } catch (error) {
        next(error);
    }
};

export const createCelebration = async (req, res, next) => {
    try {
        const {hour, title, description, lectures, isSolemn} = req.body;
        const id = uuid();
        const celebration = {
            id,
            hour,
            title,
            description,
            lectures,
            isSolemn
        };
        const collection = await data();
        await collection.insertOne(celebration);
        res.status(201).json({ok: true, celebration});
    } catch (error) {
        next(error);
    }
}

//PUT
export const updateCelebration = async (req, res, next) => {
    try {
        const {id} = req.params;
        const update = {
            isSolemn: req.body.isSolemn,
            hour: req.body.hour,
        };
        const collection = await data();
        const result = await collection.updateOne({_id: new ObjectId(id)}, {$set: update});
        if (result.matchedCount === 0) {
            return res.status(404).json({ok: false, message: 'Celebrazione non trovata'});
        }
        res.status(200).json({ok: true, message: 'Celebrazione aggiornata correttamente'});
    } catch (error) {
        next(error);
    }
};

//DELETE
export const deleteCelebration = async (req, res, next) => {
    try {
        const {id} = req.params;
        const collection = await data();
        //Search for the property _id
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ok: false, message: `Celebrazione non trovata con parametro: ${id}`});
        }
        res.status(200).json({ok: true, message: 'Celebrazione eliminata correttamente'});
    } catch (error) {
        next(error);
    }
};