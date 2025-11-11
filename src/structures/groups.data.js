import { v4 as uuid } from 'uuid';
import {connectToDatabase as db} from "../config/database.config.js";
import {ObjectId} from "mongodb";

async function data() {
    const database = await db();
    return database.collection('groups');
}

export const getGroups = async (req, res, next) => {
    try {
        const collection = await data();
        const groups = await collection.find({}).toArray();
        res.status(200).json(groups);
    } catch (error) {
        next(error);
    }
};

export const createGroup = async (req, res, next) => {
    try {
        const { id, name, description, informations, partecipants } = req.body;
        const group = {
            _id: new ObjectId(id),
            name,
            description,
            informations,
            partecipants,
        };
        const collection = await data();
        await collection.insertOne(group);
        res.status(201).json({ok: true, group});
    } catch (error) {
        next(error);
    }
}

export const updateGroup = async (req, res, next) => {
    try {
        const {id} = req.params;
        const update = {
            name: req.body.name,
            description: req.body.description,
            informations: req.body.informations,
            partecipants: req.body.partecipants,
        };
        const collection = await data();
        const result = await collection.updateOne({_id: new ObjectId(id)}, {$set: update});
        if (result.matchedCount === 0) {
            return res.status(404).json({ok: false, message: 'Gruppo non trovato'});
        }
        res.status(200).json({ok: true, message: 'Gruppo aggiornato correttamente'});
    } catch (error) {
        next(error);
    }
}

export const deleteGroup = async (req, res, next) => {
    try {
        const {id} = req.params;
        const collection = await data();
        const result = await collection.deleteOne({_id: new ObjectId(id)});
        if (result.deletedCount === 0) {
            return res.status(404).json({ok: false, message: 'Gruppo non trovato'});
        }
        res.status(200).json({ok: true, message: 'Gruppo eliminato correttamente'});
    } catch (error) {
        next(error);
    }
}