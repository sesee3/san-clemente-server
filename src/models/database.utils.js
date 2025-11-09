import {connectToDatabase as database} from "../config/database.config.js";

export async function getItem(collection, id) {
    const db = await database();
    const collct = db.collection(collection);
    const result = await collct.findOne({_id: id});
    return result !== null;
}

export async function getTodayElements(collection) {
    const db = await database();
    const collct = db.collection(collection);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const elements = await collct.find({ date: { $gte: start, $lt: end } }).toArray();
    return elements;
}

export async function removeLecturesOfToday() {
    const db = await database();
    const collection = db.collection("lectures");

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const result = await collection.deleteMany({
        date: { $gte: start, $lt: end }
    });

    return result.deletedCount;
}