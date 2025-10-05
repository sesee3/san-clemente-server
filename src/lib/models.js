"use strict";

/**
 * Data models for JSONDatabase: users and notes collections.
 * - Uses filesystem-backed JSON database (see ./db.js)
 * - Validates records with Zod schemas
 * - Sets up equality indexes for efficient lookups
 * - Optional admin seeding via environment variables
 *
 * Environment variables:
 * - DATA_DIR: directory for JSON data files (default: ../../data)
 * - ADMIN_EMAIL: seed an admin user if users collection is empty
 * - ADMIN_PASSWORD: password for seeded admin user
 * - ADMIN_NAME: display name for seeded admin user (default: "Admin")
 */

const path = require("path");
const os = require("os");
const { JSONDatabase } = require("./db");
const { hashPassword, safeUser } = require("./auth");
const z = require("zod");

// Schemas

const userSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(),
  name: z.string().min(1, "Name is required"),
  passwordHash: z.string().min(1, "Password hash is required"),
  roles: z.array(z.string()).default([]).optional(),
  isActive: z.boolean().default(true).optional(),
  // Timestamps are assigned by the DB layer; keep them optional in the schema.
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastLoginAt: z.string().optional(),
});

const noteSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  content: z.string().default("").optional(),
  tags: z.array(z.string()).default([]).optional(),
  // Timestamps assigned by DB layer
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const alertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required"),
  message: z.string().min(1, "Message is required"),
  date: z.string().optional(),
  relevance: z.string().min(1, "Relevance is required"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const eventSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  date: z.string().min(1, "Date is required"),
  isSaved: z.boolean(),
  additionalNotes: z.array(z.string()).default([]).optional(),
  endDate: z.string().optional(),
  image: z.string().min(1, "Image (base64) is required"),
  type: z.string().min(1, "Type is required"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const alerts = db.collection("alerts", {
  primaryKey: "id",
  schema: alertSchema,
  indexes: ["relevance", "date", "title"],
});

const events = db.collection("events", {
  primaryKey: "id",
  schema: eventSchema,
  indexes: ["date", "type", "title", "isSaved"],
});

/**
 * Create and configure models.
 * @param {{dataDir?: string}} [options]
 * @returns {{
 *   db: import('./db').JSONDatabase,
 *   users: import('./db').JSONCollection,
 *   notes: import('./db').JSONCollection,
 *   userSchema: typeof userSchema,
 *   noteSchema: typeof noteSchema,
 *   safeUser: (u: object, extra?: string[]) => object,
 *   ready: Promise<void>
 * }}
 */
function createModels(options = {}) {
  const dataDir =
    options.dataDir ||
    process.env.DATA_DIR ||
    (process.env.NODE_ENV === "production"
      ? path.join(os.tmpdir(), "server-san-clemente-data")
      : path.join(__dirname, "../../data"));

  const db = new JSONDatabase({ dataDir });

  const users = db.collection("users", {
    primaryKey: "id",
    schema: userSchema,
    indexes: [{ field: "email", unique: true }, "isActive"],
  });

  const notes = db.collection("notes", {
    primaryKey: "id",
    schema: noteSchema,
    indexes: ["userId", "title"],
  });

  // Seed an admin user if collection is empty and env is configured
  async function seedAdminIfEmpty() {
    const existing = await users.all();
    const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
    if (existing.length === 0 && ADMIN_EMAIL && ADMIN_PASSWORD) {
      const passwordHash = await hashPassword(String(ADMIN_PASSWORD));
      await users.create({
        email: String(ADMIN_EMAIL).trim().toLowerCase(),
        name: ADMIN_NAME ? String(ADMIN_NAME) : "Admin",
        passwordHash,
        roles: ["admin"],
        isActive: true,
      });
      // eslint-disable-next-line no-console
      console.log("[models] Seeded admin user:", ADMIN_EMAIL);
    }
  }

  const ready = seedAdminIfEmpty().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
      "[models] Admin seed failed:",
      err && err.message ? err.message : err,
    );
  });

  return {
    db,
    users,
    notes,
    alerts,
    events,
    userSchema,
    noteSchema,
    alertSchema,
    eventSchema,
    safeUser,
    ready,
  };
}

// Singleton accessor to avoid multiple DB instances in the same process
let _singleton = null;
/**
 * Get a shared models instance (singleton). Creates on first call.
 * @returns {ReturnType<typeof createModels>}
 */
function getModels() {
  if (!_singleton) {
    _singleton = createModels();
  }
  return _singleton;
}

module.exports = {
  createModels,
  getModels,
  userSchema,
  noteSchema,
  alertSchema,
  eventSchema,
  safeUser,
};
