import { v4 as uuid } from 'uuid';
import {connectToDatabase as db} from "../config/database.config.js";
import { getLectures} from "../models/lecturesCaches.js";

async function data() {
    const database = await db();
    return database.collection('lectures');
}

export const getTodayLectures = async (req, res, next) => {
    try {
        const collection = await data();

        const today = new Date();
        const day = today.getDate().toString().padStart(2, "0");
        const month = (today.getMonth() + 1).toString().padStart(2, "0");
        const year = today.getFullYear();

        const todayString = `${year}${month}${day}`;


        const lectures = await collection.find({
            date: { $regex: `^${todayString}` }
        }).toArray();

        res.status(200).json(lectures);
    } catch (error) {
        next(error);
    }
};

//TODO: Prevent to add multiple times the same lecture
export const fetchLectures = async (req, res, next) => {
    try {
        const collection = await data();

        const today = new Date();
        const day = today.getDate().toString().padStart(2, "0");
        const month = (today.getMonth() + 1).toString().padStart(2, "0");
        const year = today.getFullYear();

        const todayString = `${year}${month}${day}`;

        const lectureData = await getLectures(`https://www.chiesacattolica.it/liturgia-del-giorno/?data-liturgia=${todayString}`);

        const lectureBuild = {
            date: todayString,
            lecture: lectureData
        };

        await collection.insertOne(lectureBuild);
        res.status(200).json(lectureBuild);

    } catch (error) {
        next(error);
    }
};

export const getLectureOfDate = async (req, res, next) => {
    const { date } = req.params.date;

    try {
        const lectures = await collection.find({
            date: { $regex: `^${date}` }
        }).toArray();

        res.status(200).json(lectures);
    } catch (error) {
        next(error);
    }
}

export const fetchLectureOfDate = async(req, res, next) => {
    const {date} = req.params.date ;

    try {

        const lectureData = await getLectures(`https://www.chiesacattolica.it/liturgia-del-giorno/?data-liturgia=${date}`);

        const lectureBuild = {
            date: todayString,
            lecture: lectureData
        };

        await collection.insertOne(lectureBuild);
        res.status(200).json(lectureBuild);
    } catch (error) {
        next(error);
    }
}

//2025/11/09
//20251109