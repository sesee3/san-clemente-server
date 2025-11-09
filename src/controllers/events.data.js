import { MongoClient, ObjectId } from "mongodb";

export const createEvent = async (req, res, next) => {
    try {
        const { title, description, date, additionalNotes, endDate, image, type } = req.body;

        const client = new MongoClient(process.env.MONGO_URI);
        await client.connect();
        const db = client.db(process.env.MONGO_DB_NAME);
        const events = db.collection("events");

        const event = {
            title,
            description,
            date: new Date(date),
            additionalNotes,
            endDate: new Date(endDate),
            image,
            type,
        };

        const result = await events.insertOne(event);
        await client.close();

        res.status(201).json({
            message: "Evento aggiunto correttamente",
            post: { _id: result.insertedId, ...event },
        });
    } catch (error) {
        next(error);
    }
};

export const getEvents = async (req, res, next) => {
    try {
        const client = new MongoClient(process.env.MONGO_URI);
        await client.connect();
        const db = client.db(process.env.MONGO_DB_NAME);
        const events = db.collection("events");

        const result = await events.find().sort({ date: -1 }).limit(100).toArray();
        await client.close();

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};