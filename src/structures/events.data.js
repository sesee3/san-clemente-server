import { v4 as uuidv4 } from "uuid";
import { connectToDatabase as db} from "../config/database.config.js";

async function getEventsCollection() {
  const database = await db();
  return database.collection("events");
}

// GET
export const getEvents = async (req, res, next) => {
  try {
    const eventsCollection = await getEventsCollection();
    const events = await eventsCollection.find({}).toArray();
    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
};

// ADD
export const createEvent = async (req, res, next) => {
  try {
    const { title, description, date, additionalNotes, endDate, image, type } =
      req.body;
    const id = uuidv4();
    const event = {
      id,
      title,
      description,
      date,
      additionalNotes,
      endDate,
      image,
      type,
    };
    const eventsCollection = await getEventsCollection();
    await eventsCollection.insertOne(event);
    res.status(201).json({ ok: true, event });
  } catch (error) {
    next(error);
  }
};

// EDIT
export const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const eventsCollection = await getEventsCollection();
    const result = await eventsCollection.updateOne({ id }, { $set: update });
    if (result.matchedCount === 0) {
      return res.status(404).json({ ok: false, message: "Evento non trovato" });
    }
    res
      .status(200)
      .json({ ok: true, message: "Evento aggiornato correttamente" });
  } catch (error) {
    next(error);
  }
};

// DELETE
export const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const eventsCollection = await getEventsCollection();
    const result = await eventsCollection.deleteOne({ id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ ok: false, message: "Evento non trovato" });
    }
    res
      .status(200)
      .json({ ok: true, message: "Evento eliminato correttamente" });
  } catch (error) {
    next(error);
  }
};
