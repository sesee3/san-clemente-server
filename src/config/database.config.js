import "dotenv/config";
import { MongoClient } from "mongodb";

const uri =
  "mongodb+srv://admin:Password444@sanclementedb.4xxrqvj.mongodb.net/?appName=mongosh+2.5.8";
const client = new MongoClient(uri);

let db = null;

export async function connectToDatabase() {
    if (db) return db;

    try {
        await client.connect();
        db = client.db("sanclementedb");
        return db;

    } catch (error) {
        console.error("❌ Database connection error:", error);
        throw error;
    }
}


