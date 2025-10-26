import { v4 as uuidv4 } from "uuid";
import { MongoClient } from "mongodb";

const uri =
  "mongodb+srv://admin:Password444@sanclementedb.4xxrqvj.mongodb.net/?appName=mongosh+2.5.8";
const client = new MongoClient(uri);

class User {
  static async create(username, password) {
    const id = uuidv4();
    const database = client.db("sanclementedb");
    const users = database.collection("users");
    await users.insertOne({ id, username, password });
    return { id, username };
  }

  static async findByName(username) {
    const database = client.db("sanclementedb");
    const users = database.collection("users");
    return await users.findOne({ username });
  }

  static async findByID(id) {
    const database = client.db("sanclementedb");
    const users = database.collection("users");
    return await users.findOne({ id });
  }
}

export default User;
