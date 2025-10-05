"use strict";

const express = require("express");
const z = require("zod");

const { getModels } = require("../lib/models");
const { requireAuth } = require("../lib/auth");
const { DatabaseError } = require("../lib/db");

const router = express.Router();

// Helpers

function getUserIdFromReq(req) {
  const payload = req.user || {};
  return payload.sub || payload.uid || null;
}

function isAdmin(req) {
  const roles = (req.user && req.user.roles) || [];
  return Array.isArray(roles) && roles.includes("admin");
}

function coerceNumber(v, def, { min, max } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  let out = n;
  if (typeof min === "number") out = Math.max(min, out);
  if (typeof max === "number") out = Math.min(max, out);
  return out;
}

// Validation Schemas

const listQuerySchema = z
  .object({
    q: z.string().optional(),
    tags: z
      .union([
        z.string(), // comma-separated or single
        z.array(z.string()),
      ])
      .optional(),
    userId: z.string().uuid().optional(), // admin can query another user
    limit: z
      .preprocess(
        (v) => (v === undefined ? undefined : Number(v)),
        z.number().int().min(1).max(100).optional(),
      )
      .default(25),
    offset: z
      .preprocess(
        (v) => (v === undefined ? undefined : Number(v)),
        z.number().int().min(0).optional(),
      )
      .default(0),
    sortBy: z
      .enum(["createdAt", "updatedAt", "title"])
      .optional()
      .default("createdAt"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  })
  .strict();

const idParamSchema = z.object({
  id: z.string().uuid({ message: "Invalid note id" }),
});

const createSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    userId: z.string().uuid().optional(), // admin only; ignored for non-admins
  })
  .strict();

const patchSchema = z
  .object({
    title: z.string().min(1, "Title is required").optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    userId: z.string().uuid().optional(), // admin only
  })
  .strict();

// Protect all routes
router.use(requireAuth());

// GET / - list notes
router.get("/", async (req, res, next) => {
  try {
    const parsed = listQuerySchema.parse(req.query || {});
    const { notes } = getModels();

    const currentUserId = getUserIdFromReq(req);
    if (!currentUserId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    // Determine target user
    const targetUserId =
      isAdmin(req) && parsed.userId ? parsed.userId : currentUserId;

    // Base equality query
    const baseQuery = { userId: targetUserId };

    // Fetch candidates using indexed filter first
    const result = await notes.findMany(baseQuery, {
      sortBy: parsed.sortBy,
      sortDir: parsed.sortDir,
      // We'll paginate after search/tag filtering to keep logic simple.
      // This is acceptable for modest datasets with FS-backed JSON.
    });

    // In-memory filters: q (title/content search) and tags
    let items = result.items;

    if (parsed.q) {
      const s = parsed.q.toLowerCase();
      items = items.filter((n) => {
        const title = String(n.title || "").toLowerCase();
        const content = String(n.content || "").toLowerCase();
        return title.includes(s) || content.includes(s);
      });
    }

    if (parsed.tags) {
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags
        : String(parsed.tags)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

      if (tags.length > 0) {
        items = items.filter((n) => {
          const ntags = Array.isArray(n.tags) ? n.tags : [];
          // require all provided tags to be present
          return tags.every((t) => ntags.includes(t));
        });
      }
    }

    const total = items.length;
    const limit = coerceNumber(parsed.limit, 25, { min: 1, max: 100 });
    const offset = coerceNumber(parsed.offset, 0, { min: 0 });

    const page = items.slice(offset, offset + limit);

    return res.json({
      items: page,
      total,
      offset,
      limit,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid query parameters", details: err.issues },
      });
    }
    return next(err);
  }
});

// GET /:id - get a single note (owner or admin)
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params || {});
    const { notes } = getModels();

    const note = await notes.read(id);
    if (!note) {
      return res.status(404).json({ error: { message: "Note not found" } });
    }

    const me = getUserIdFromReq(req);
    if (!isAdmin(req) && note.userId !== me) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    return res.json({ note });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid request", details: err.issues },
      });
    }
    return next(err);
  }
});

// POST / - create a note
router.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body || {});
    const { notes } = getModels();

    const me = getUserIdFromReq(req);
    if (!me) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const userId = isAdmin(req) && body.userId ? body.userId : me;

    const created = await notes.create({
      userId,
      title: body.title,
      content: body.content || "",
      tags: Array.isArray(body.tags) ? body.tags : [],
    });

    return res.status(201).json({ note: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid request body", details: err.issues },
      });
    }
    if (err instanceof DatabaseError) {
      return res.status(400).json({
        error: { message: err.message, code: err.code },
      });
    }
    return next(err);
  }
});

// PATCH /:id - update a note (owner or admin)
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params || {});
    const body = patchSchema.parse(req.body || {});
    const { notes } = getModels();

    const existing = await notes.read(id);
    if (!existing) {
      return res.status(404).json({ error: { message: "Note not found" } });
    }

    const me = getUserIdFromReq(req);
    const admin = isAdmin(req);
    if (!admin && existing.userId !== me) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const patch = {};

    if (body.title !== undefined) patch.title = body.title;
    if (body.content !== undefined) patch.content = body.content;
    if (body.tags !== undefined)
      patch.tags = Array.isArray(body.tags) ? body.tags : [];

    // Admin can reassign note to a different user
    if (admin && body.userId !== undefined) {
      patch.userId = body.userId;
    }

    if (Object.keys(patch).length === 0) {
      return res
        .status(400)
        .json({ error: { message: "No updatable fields provided" } });
    }

    const updated = await notes.update(id, patch);

    return res.json({ note: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid request body", details: err.issues },
      });
    }
    if (err instanceof DatabaseError) {
      const status =
        err.code === "ENOTFOUND" ? 404 : err.code === "EVALIDATION" ? 400 : 400;
      return res.status(status).json({
        error: { message: err.message, code: err.code },
      });
    }
    return next(err);
  }
});

// DELETE /:id - delete a note (owner or admin)
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params || {});
    const { notes } = getModels();

    const existing = await notes.read(id);
    if (!existing) {
      return res.status(404).json({ error: { message: "Note not found" } });
    }

    const me = getUserIdFromReq(req);
    if (!isAdmin(req) && existing.userId !== me) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const ok = await notes.remove(id);
    if (!ok) {
      return res.status(404).json({ error: { message: "Note not found" } });
    }

    return res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid request", details: err.issues },
      });
    }
    return next(err);
  }
});

/**
 * Alerts CRUD (aligned with SwiftUI struct)
 * Alert: { id, title, message, date?, relevance }
 */

// Validation Schemas for Alerts
const alertListQuerySchema = z
  .object({
    q: z.string().optional(),
    relevance: z.string().optional(),
    limit: z
      .preprocess(
        (v) => (v === undefined ? undefined : Number(v)),
        z.number().int().min(1).max(100).optional(),
      )
      .default(25),
    offset: z
      .preprocess(
        (v) => (v === undefined ? undefined : Number(v)),
        z.number().int().min(0).optional(),
      )
      .default(0),
    sortBy: z
      .enum(["createdAt", "updatedAt", "title", "date"])
      .optional()
      .default("createdAt"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  })
  .strict();

const alertIdParamSchema = z.object({
  id: z.string().uuid({ message: "Invalid alert id" }),
});

const alertCreateSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    message: z.string().min(1, "Message is required"),
    date: z.string().optional(),
    relevance: z.string().min(1, "Relevance is required"),
  })
  .strict();

const alertPatchSchema = z
  .object({
    title: z.string().min(1, "Title is required").optional(),
    message: z.string().min(1, "Message is required").optional(),
    date: z.string().optional(),
    relevance: z.string().min(1, "Relevance is required").optional(),
  })
  .strict();

// GET /alerts - list alerts
router.get("/alerts", async (req, res, next) => {
  try {
    const parsed = alertListQuerySchema.parse(req.query || {});
    const { alerts } = getModels();

    const baseQuery = {};
    if (parsed.relevance) baseQuery.relevance = parsed.relevance;

    const result = await alerts.findMany(baseQuery, {
      sortBy: parsed.sortBy,
      sortDir: parsed.sortDir,
    });

    let items = result.items;

    if (parsed.q) {
      const s = parsed.q.toLowerCase();
      items = items.filter((a) => {
        const title = String(a.title || "").toLowerCase();
        const message = String(a.message || "").toLowerCase();
        return title.includes(s) || message.includes(s);
      });
    }

    const total = items.length;
    const limit = Number(parsed.limit);
    const offset = Number(parsed.offset);
    const page = items.slice(offset, offset + limit);

    return res.json({ items: page, total, offset, limit });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid query parameters", details: err.issues },
      });
    }
    return next(err);
  }
});

// GET /alerts/:id - get alert
router.get("/alerts/:id", async (req, res, next) => {
  try {
    const { id } = alertIdParamSchema.parse(req.params || {});
    const { alerts } = getModels();

    const alert = await alerts.read(id);
    if (!alert) {
      return res.status(404).json({ error: { message: "Alert not found" } });
    }
    return res.json({ alert });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: { message: "Invalid request", details: err.issues } });
    }
    return next(err);
  }
});

// POST /alerts - create alert
router.post("/alerts", async (req, res, next) => {
  try {
    const body = alertCreateSchema.parse(req.body || {});
    const { alerts } = getModels();

    const created = await alerts.create({
      title: body.title,
      message: body.message,
      date: body.date,
      relevance: body.relevance,
    });

    return res.status(201).json({ alert: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid request body", details: err.issues },
      });
    }
    if (err instanceof DatabaseError) {
      return res
        .status(400)
        .json({ error: { message: err.message, code: err.code } });
    }
    return next(err);
  }
});

// PATCH /alerts/:id - update alert
router.patch("/alerts/:id", async (req, res, next) => {
  try {
    const { id } = alertIdParamSchema.parse(req.params || {});
    const body = alertPatchSchema.parse(req.body || {});
    const { alerts } = getModels();

    const existing = await alerts.read(id);
    if (!existing) {
      return res.status(404).json({ error: { message: "Alert not found" } });
    }

    const patch = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.message !== undefined) patch.message = body.message;
    if (body.date !== undefined) patch.date = body.date;
    if (body.relevance !== undefined) patch.relevance = body.relevance;

    if (Object.keys(patch).length === 0) {
      return res
        .status(400)
        .json({ error: { message: "No updatable fields provided" } });
    }

    const updated = await alerts.update(id, patch);
    return res.json({ alert: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid request body", details: err.issues },
      });
    }
    if (err instanceof DatabaseError) {
      const status =
        err.code === "ENOTFOUND" ? 404 : err.code === "EVALIDATION" ? 400 : 400;
      return res
        .status(status)
        .json({ error: { message: err.message, code: err.code } });
    }
    return next(err);
  }
});

// DELETE /alerts/:id - delete alert
router.delete("/alerts/:id", async (req, res, next) => {
  try {
    const { id } = alertIdParamSchema.parse(req.params || {});
    const { alerts } = getModels();

    const ok = await alerts.remove(id);
    if (!ok) {
      return res.status(404).json({ error: { message: "Alert not found" } });
    }
    return res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: { message: "Invalid request", details: err.issues } });
    }
    return next(err);
  }
});

/**
 * Events CRUD (aligned with SwiftUI struct)
 * Event: { id, title, description, date, isSaved, additionalNotes[], endDate?, image(base64), type }
 */

// Validation Schemas for Events
const eventListQuerySchema = z
  .object({
    q: z.string().optional(),
    type: z.string().optional(),
    isSaved: z
      .union([
        z.string(), // "true" / "false"
        z.boolean(),
      ])
      .optional(),
    limit: z
      .preprocess(
        (v) => (v === undefined ? undefined : Number(v)),
        z.number().int().min(1).max(100).optional(),
      )
      .default(25),
    offset: z
      .preprocess(
        (v) => (v === undefined ? undefined : Number(v)),
        z.number().int().min(0).optional(),
      )
      .default(0),
    sortBy: z
      .enum(["createdAt", "updatedAt", "title", "date"])
      .optional()
      .default("createdAt"),
    sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  })
  .strict();

const eventIdParamSchema = z.object({
  id: z.string().uuid({ message: "Invalid event id" }),
});

const eventCreateSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    date: z.string().min(1, "Date is required"),
    isSaved: z.boolean(),
    additionalNotes: z.array(z.string()).optional(),
    endDate: z.string().optional(),
    image: z.string().min(1, "Image (base64) is required"),
    type: z.string().min(1, "Type is required"),
  })
  .strict();

const eventPatchSchema = z
  .object({
    title: z.string().min(1, "Title is required").optional(),
    description: z.string().min(1, "Description is required").optional(),
    date: z.string().optional(),
    isSaved: z.boolean().optional(),
    additionalNotes: z.array(z.string()).optional(),
    endDate: z.string().optional(),
    image: z.string().min(1, "Image (base64) is required").optional(),
    type: z.string().min(1, "Type is required").optional(),
  })
  .strict();

function coerceBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase().trim();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
}

// GET /events - list events
router.get("/events", async (req, res, next) => {
  try {
    const parsed = eventListQuerySchema.parse(req.query || {});
    const { events } = getModels();

    const baseQuery = {};
    if (parsed.type) baseQuery.type = parsed.type;
    const saved = coerceBool(parsed.isSaved);
    if (typeof saved === "boolean") baseQuery.isSaved = saved;

    const result = await events.findMany(baseQuery, {
      sortBy: parsed.sortBy,
      sortDir: parsed.sortDir,
    });

    let items = result.items;

    if (parsed.q) {
      const s = parsed.q.toLowerCase();
      items = items.filter((e) => {
        const title = String(e.title || "").toLowerCase();
        const desc = String(e.description || "").toLowerCase();
        return title.includes(s) || desc.includes(s);
      });
    }

    const total = items.length;
    const limit = Number(parsed.limit);
    const offset = Number(parsed.offset);
    const page = items.slice(offset, offset + limit);

    return res.json({ items: page, total, offset, limit });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid query parameters", details: err.issues },
      });
    }
    return next(err);
  }
});

// GET /events/:id - get event
router.get("/events/:id", async (req, res, next) => {
  try {
    const { id } = eventIdParamSchema.parse(req.params || {});
    const { events } = getModels();

    const event = await events.read(id);
    if (!event) {
      return res.status(404).json({ error: { message: "Event not found" } });
    }
    return res.json({ event });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: { message: "Invalid request", details: err.issues } });
    }
    return next(err);
  }
});

// POST /events - create event
router.post("/events", async (req, res, next) => {
  try {
    const body = eventCreateSchema.parse(req.body || {});
    const { events } = getModels();

    const created = await events.create({
      title: body.title,
      description: body.description,
      date: body.date,
      isSaved: body.isSaved,
      additionalNotes: Array.isArray(body.additionalNotes)
        ? body.additionalNotes
        : [],
      endDate: body.endDate,
      image: body.image, // base64 string from Swift Codable(Data)
      type: body.type,
    });

    return res.status(201).json({ event: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid request body", details: err.issues },
      });
    }
    if (err instanceof DatabaseError) {
      return res
        .status(400)
        .json({ error: { message: err.message, code: err.code } });
    }
    return next(err);
  }
});

// PATCH /events/:id - update event
router.patch("/events/:id", async (req, res, next) => {
  try {
    const { id } = eventIdParamSchema.parse(req.params || {});
    const body = eventPatchSchema.parse(req.body || {});
    const { events } = getModels();

    const existing = await events.read(id);
    if (!existing) {
      return res.status(404).json({ error: { message: "Event not found" } });
    }

    const patch = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.date !== undefined) patch.date = body.date;
    if (body.isSaved !== undefined) patch.isSaved = body.isSaved;
    if (body.additionalNotes !== undefined)
      patch.additionalNotes = Array.isArray(body.additionalNotes)
        ? body.additionalNotes
        : [];
    if (body.endDate !== undefined) patch.endDate = body.endDate;
    if (body.image !== undefined) patch.image = body.image;
    if (body.type !== undefined) patch.type = body.type;

    if (Object.keys(patch).length === 0) {
      return res
        .status(400)
        .json({ error: { message: "No updatable fields provided" } });
    }

    const updated = await events.update(id, patch);
    return res.json({ event: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: "Invalid request body", details: err.issues },
      });
    }
    if (err instanceof DatabaseError) {
      const status =
        err.code === "ENOTFOUND" ? 404 : err.code === "EVALIDATION" ? 400 : 400;
      return res
        .status(status)
        .json({ error: { message: err.message, code: err.code } });
    }
    return next(err);
  }
});

// DELETE /events/:id - delete event
router.delete("/events/:id", async (req, res, next) => {
  try {
    const { id } = eventIdParamSchema.parse(req.params || {});
    const { events } = getModels();

    const ok = await events.remove(id);
    if (!ok) {
      return res.status(404).json({ error: { message: "Event not found" } });
    }
    return res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: { message: "Invalid request", details: err.issues } });
    }
    return next(err);
  }
});

module.exports = router;
