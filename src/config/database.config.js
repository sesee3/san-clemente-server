import "dotenv/config";
import { MongoClient } from "mongodb";

const uri =
  "mongodb+srv://admin:Password444@sanclementedb.4xxrqvj.mongodb.net/?appName=mongosh+2.5.8";
const client = new MongoClient(uri);

async function connectToDatabase() {
  try {
    await client.connect();
    console.log("Database connected");
    await runDatabase();
  } catch (error) {
    console.error(error);
  }
}

async function testPrintEvents() {
  try {
    const database = client.db("sanclementedb");
    const events = database.collection("events");

    const allEvents = await events.find({}).toArray();

    return allEvents;
  } catch (error) {
    next(error);
  }
}

export default testPrintEvents;
