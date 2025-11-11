import { connectToDatabase as db} from "../config/database.config.js";
import {ObjectId} from "mongodb";

async function data() {
  const database = await db();
  return database.collection("events");
}

// GET
export const getEvents = async (req, res, next) => {
  try {
    const eventsCollection = await data();
    const events = await eventsCollection.find({}).toArray();
    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
};

// ADD
export const createEvent = async (req, res, next) => {
  try {
    const { id, title, description, date, additionalNotes, endDate, image, type } =
      req.body;
    const event = {
        _id: new ObjectId(id),
      title,
      description,
      date,
      additionalNotes,
      endDate,
      image,
      type,
    };
    const eventsCollection = await data();
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
    const update = {
        title: req.body.title,
        description: req.body.description,
        date: req.body.date,
        additionalNotes: req.body.additionalNotes,
        endDate: req.body.endDate,
        image: req.body.image,
        type: req.body.type,
    };
    const eventsCollection = await data();
    const result = await eventsCollection.updateOne({ _id: new ObjectId(id) }, { $set: update });
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

      console.log(id);

      const collection = await data();
      const result = await collection.deleteOne({_id: new ObjectId(id)});
      if (result.deletedCount === 0) {
          return res.status(404).json({ok: false, message: 'Evento non trovato'});
      }
      res.status(200).json({ok: true, message: 'Evento eliminato correttamente'});
  } catch (error) {
    next(error);
  }
};
