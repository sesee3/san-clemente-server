'use strict';

/**
 * Filesystem-backed JSON database helper
 * - Atomic writes (temp file + rename)
 * - CRUD operations
 * - Basic equality indexes (with optional unique constraint)
 * - Optional Zod schema validation per collection
 *
 * Example:
 * const { JSONDatabase } = require('./lib/db');
 * const db = new JSONDatabase({ dataDir: path.join(__dirname, '../../data') });
 * const users = db.collection('users', {
 *   primaryKey: 'id',
 *   schema: z.object({
 *     id: z.string().uuid().optional(),
 *     email: z.string().email(),
 *     name: z.string(),
 *     passwordHash: z.string(),
 *     createdAt: z.string(),
 *     updatedAt: z.string(),
 *   }),
 *   indexes: [
 *     { field: 'email', unique: true }
 *   ]
 * });
 * await users.create({ email: 'a@b.com', name: 'A', passwordHash: '...' });
 */

const path = require('path');
const fs = require('fs/promises');
const fse = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

// Zod is optional at runtime. If not present in options, we won't require it.
let zod;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies, global-require
  zod = require('zod');
} catch {
  zod = null;
}

/**
 * Simple async mutex to serialize writes
 */
class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }
  async lock() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }
  unlock() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
  async run(fn) {
    await this.lock();
    try {
      return await fn();
    } finally {
      this.unlock();
    }
  }
}

/**
 * Atomically write JSON file by writing to a temp file then renaming.
 * Ensures directory exists.
 */
async function atomicWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  await fse.ensureDir(dir);

  // Slightly stable stringify (sorted keys) for deterministic diffs
  const json = stableStringify(data, 2);

  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  await fs.writeFile(tmp, json, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, filePath);
}

/**
 * Read JSON file, returning fallback if missing or empty.
 */
async function readJSON(filePath, fallback) {
  try {
    const buf = await fs.readFile(filePath, 'utf8');
    if (!buf || buf.trim().length === 0) return fallback;
    return JSON.parse(buf);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return fallback;
    }
    throw err;
  }
}

/**
 * Deep get by dot-path (e.g., "profile.email")
 */
function getByPath(obj, dotPath) {
  if (!dotPath) return undefined;
  const parts = dotPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Stable stringify with sorted object keys
 */
function stableStringify(value, space = 0) {
  const seen = new WeakSet();
  function replacer(_k, v) {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      if (Array.isArray(v)) return v;
      // sort keys
      const sorted = {};
      Object.keys(v)
        .sort()
        .forEach((key) => {
          sorted[key] = v[key];
        });
      return sorted;
    }
    return v;
  }
  return JSON.stringify(value, replacer, space);
}

class DatabaseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
  }
}

/**
 * Collection backed by a single JSON file with an array of records.
 */
class JSONCollection {
  constructor(options) {
    const {
      name,
      dataDir,
      primaryKey = 'id',
      schema = null,
      indexes = [],
      fileName, // optional override, defaults to `${name}.json`
    } = options || {};

    if (!name) throw new DatabaseError('Collection "name" is required');
    if (!dataDir) throw new DatabaseError('"dataDir" is required');

    this.name = name;
    this.dataDir = dataDir;
    this.primaryKey = primaryKey;
    this.schema = schema || null;
    this.filePath = path.join(dataDir, fileName || `${name}.json`);
    this._mutex = new Mutex();

    // In-memory state
    this._loaded = false;
    this._data = [];
    this._byId = new Map();
    this._indexDefs = new Map(); // field -> { unique: boolean }
    this._indexes = new Map(); // field -> Map(value -> Set<id>)

    // Configure indexes
    for (const def of normalizeIndexes(indexes)) {
      this._indexDefs.set(def.field, { unique: !!def.unique });
      this._indexes.set(def.field, new Map());
    }
  }

  // Lazy load on first access
  async _ensureLoaded() {
    if (this._loaded) return;
    await fse.ensureDir(this.dataDir);
    const arr = await readJSON(this.filePath, []);
    if (!Array.isArray(arr)) {
      throw new DatabaseError(
        `Corrupt data for collection "${this.name}": expected array`
      );
    }
    this._data = arr;
    this._byId = new Map();
    for (const rec of this._data) {
      const id = rec?.[this.primaryKey];
      if (id == null) continue;
      this._byId.set(id, rec);
    }
    // Rebuild indexes
    this._rebuildIndexes();
    this._loaded = true;
  }

  _rebuildIndexes() {
    for (const [field] of this._indexDefs) {
      this._indexes.set(field, new Map());
    }
    for (const rec of this._data) {
      this._indexInsert(rec);
    }
  }

  _indexInsert(rec) {
    for (const [field, def] of this._indexDefs) {
      const value = getByPath(rec, field);
      const id = rec?.[this.primaryKey];
      if (value === undefined || id == null) continue;

      const map = this._indexes.get(field);
      let set = map.get(value);
      if (!set) {
        set = new Set();
        map.set(value, set);
      }
      if (def.unique && set.size > 0 && !set.has(id)) {
        throw new DatabaseError(
          `Unique index violation on "${field}" for value "${String(value)}"`,
          'EINDEX_UNIQUE'
        );
      }
      set.add(id);
    }
  }

  _indexRemove(rec) {
    for (const [field] of this._indexDefs) {
      const value = getByPath(rec, field);
      const id = rec?.[this.primaryKey];
      if (value === undefined || id == null) continue;
      const map = this._indexes.get(field);
      const set = map.get(value);
      if (set) {
        set.delete(id);
        if (set.size === 0) map.delete(value);
      }
    }
  }

  _indexUpdate(oldRec, newRec) {
    // For each indexed field, if the value changed, move the id
    for (const [field, def] of this._indexDefs) {
      const oldVal = getByPath(oldRec, field);
      const newVal = getByPath(newRec, field);
      if (oldVal === newVal) continue;
      const id = newRec?.[this.primaryKey];
      const map = this._indexes.get(field);

      if (oldVal !== undefined) {
        const setOld = map.get(oldVal);
        if (setOld) {
          setOld.delete(id);
          if (setOld.size === 0) map.delete(oldVal);
        }
      }
      if (newVal !== undefined) {
        let setNew = map.get(newVal);
        if (!setNew) {
          setNew = new Set();
          map.set(newVal, setNew);
        }
        if (def.unique && setNew.size > 0 && !setNew.has(id)) {
          throw new DatabaseError(
            `Unique index violation on "${field}" for value "${String(newVal)}"`,
            'EINDEX_UNIQUE'
          );
        }
        setNew.add(id);
      }
    }
  }

  async _persist() {
    await atomicWriteJSON(this.filePath, this._data);
  }

  addIndex(field, { unique = false } = {}) {
    if (this._indexDefs.has(field)) return;
    this._indexDefs.set(field, { unique: !!unique });
    this._indexes.set(field, new Map());
    // Build from existing
    for (const rec of this._data) {
      this._indexInsert(rec);
    }
  }

  /**
   * Create a new record.
   * - Assigns UUID if primary key is missing
   * - Validates against schema if provided
   * - Enforces unique indexes
   */
  async create(record) {
    await this._ensureLoaded();
    return this._mutex.run(async () => {
      let rec = { ...record };

      // Validate before assigning id so schema can have id optional
      if (this.schema && zod && this.schema.safeParse) {
        const parsed = this.schema.safeParse(rec);
        if (!parsed.success) {
          const issues = parsed.error.issues?.map((i) => i.message).join('; ');
          throw new DatabaseError(`Validation failed: ${issues}`, 'EVALIDATION');
        }
        rec = parsed.data;
      }

      const nowIso = new Date().toISOString();
      if (rec[this.primaryKey] == null) {
        rec[this.primaryKey] = uuidv4();
      }
      if (rec.createdAt == null) rec.createdAt = nowIso;
      rec.updatedAt = nowIso;

      const id = rec[this.primaryKey];
      if (this._byId.has(id)) {
        throw new DatabaseError(
          `Duplicate ${this.primaryKey} "${id}"`,
          'EPRIMARY_DUP'
        );
      }

      // Index checks + insert
      this._indexInsert(rec);

      // Commit to memory
      this._data.push(rec);
      this._byId.set(id, rec);

      // Persist
      await this._persist();

      return clone(rec);
    });
  }

  /**
   * Read by primary key. Returns null if not found.
   */
  async read(id) {
    await this._ensureLoaded();
    const rec = this._byId.get(id) || null;
    return rec ? clone(rec) : null;
  }

  /**
   * Find first record matching query object (field equality).
   */
  async findOne(query) {
    const results = await this.findMany(query, { limit: 1 });
    return results.items[0] || null;
  }

  /**
   * Find many records by query (equality filters), with optional pagination/sort.
   * - query: { fieldA: value, "nested.field": value }
   * - options: { sortBy, sortDir, offset, limit }
   */
  async findMany(query = {}, options = {}) {
    await this._ensureLoaded();
    const { sortBy, sortDir = 'asc', offset = 0, limit } = options;

    let candidates;

    // If query uses an indexed field with value, we can narrow quickly
    const indexedField = Object.keys(query).find((f) => this._indexDefs.has(f));
    if (indexedField != null) {
      const val = query[indexedField];
      const ids = this._indexes.get(indexedField).get(val);
      if (!ids || ids.size === 0) {
        return { items: [], total: 0, offset, limit: limit || null };
      }
      candidates = Array.from(ids, (id) => this._byId.get(id)).filter(Boolean);
    } else {
      candidates = this._data;
    }

    const filtered = candidates.filter((rec) => matchesQuery(rec, query));

    let sorted = filtered;
    if (sortBy) {
      const dir = sortDir.toLowerCase() === 'desc' ? -1 : 1;
      sorted = filtered.slice().sort((a, b) => {
        const av = getByPath(a, sortBy);
        const bv = getByPath(b, sortBy);
        if (av == null && bv == null) return 0;
        if (av == null) return -1 * dir;
        if (bv == null) return 1 * dir;
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }

    const total = sorted.length;
    const sliced =
      typeof limit === 'number'
        ? sorted.slice(offset, offset + limit)
        : sorted.slice(offset);

    return {
      items: sliced.map(clone),
      total,
      offset,
      limit: typeof limit === 'number' ? limit : null,
    };
  }

  /**
   * Update record by id (partial update).
   * - Validates final record against schema if provided
   * - Enforces unique indexes
   */
  async update(id, patch) {
    await this._ensureLoaded();
    return this._mutex.run(async () => {
      const existing = this._byId.get(id);
      if (!existing) {
        throw new DatabaseError(
          `Record with ${this.primaryKey} "${id}" not found`,
          'ENOTFOUND'
        );
      }
      if (patch[this.primaryKey] && patch[this.primaryKey] !== id) {
        throw new DatabaseError(
          `Cannot change primary key "${this.primaryKey}"`,
          'EPRIMARY_IMMUTABLE'
        );
      }

      const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };

      if (this.schema && zod && this.schema.safeParse) {
        const parsed = this.schema.safeParse(next);
        if (!parsed.success) {
          const issues = parsed.error.issues?.map((i) => i.message).join('; ');
          throw new DatabaseError(`Validation failed: ${issues}`, 'EVALIDATION');
        }
      }

      // Update indexes (may throw on unique violation)
      this._indexUpdate(existing, next);

      // Commit
      Object.assign(existing, next);

      await this._persist();

      return clone(existing);
    });
  }

  /**
   * Upsert: update the first matching query or create a new one with payload.
   * - query uses equality fields
   * - payload is merged into existing or used to create new
   */
  async upsert(query, payload) {
    const found = await this.findOne(query);
    if (found) {
      return this.update(found[this.primaryKey], payload);
    }
    return this.create({ ...query, ...payload });
  }

  /**
   * Remove by id. Returns true if removed, false if not found.
   */
  async remove(id) {
    await this._ensureLoaded();
    return this._mutex.run(async () => {
      const existing = this._byId.get(id);
      if (!existing) return false;

      // Remove from indexes
      this._indexRemove(existing);

      // Remove from array and map
      this._data = this._data.filter((r) => r[this.primaryKey] !== id);
      this._byId.delete(id);

      await this._persist();
      return true;
    });
  }

  /**
   * Return all records (copy). For large datasets, prefer findMany with paging.
   */
  async all() {
    await this._ensureLoaded();
    return this._data.map(clone);
  }

  /**
   * Reload from disk (discarding in-memory changes not persisted).
   */
  async reload() {
    this._loaded = false;
    await this._ensureLoaded();
  }

  /**
   * Replace entire dataset with new array of records (dangerous).
   * - Validates each record if schema present
   * - Rebuilds indexes
   */
  async replaceAll(records) {
    if (!Array.isArray(records)) {
      throw new DatabaseError('replaceAll expects an array');
    }
    await this._mutex.run(async () => {
      const nowIso = new Date().toISOString();

      // Validate and normalize
      const normalized = records.map((r) => {
        let rec = { ...r };
        if (rec[this.primaryKey] == null) rec[this.primaryKey] = uuidv4();
        if (rec.createdAt == null) rec.createdAt = nowIso;
        if (rec.updatedAt == null) rec.updatedAt = nowIso;

        if (this.schema && zod && this.schema.safeParse) {
          const parsed = this.schema.safeParse(rec);
          if (!parsed.success) {
            const issues = parsed.error.issues?.map((i) => i.message).join('; ');
            throw new DatabaseError(
              `Validation failed: ${issues}`,
              'EVALIDATION'
            );
          }
          rec = parsed.data;
        }
        return rec;
      });

      // Build maps and check duplicates
      const byId = new Map();
      for (const rec of normalized) {
        const id = rec[this.primaryKey];
        if (byId.has(id)) {
          throw new DatabaseError(
            `Duplicate ${this.primaryKey} "${id}"`,
            'EPRIMARY_DUP'
          );
        }
        byId.set(id, rec);
      }

      // Swap in-memory state and rebuild indexes
      this._data = normalized;
      this._byId = byId;
      this._rebuildIndexes();

      await this._persist();
    });
  }
}

/**
 * JSON database managing multiple collections under a data directory.
 */
class JSONDatabase {
  constructor({ dataDir }) {
    if (!dataDir) throw new DatabaseError('"dataDir" is required');
    this.dataDir = dataDir;
    this._collections = new Map();
  }

  /**
   * Get or create a collection.
   *
   * options:
   * - primaryKey?: string
   * - schema?: zod schema
   * - indexes?: Array<string | { field: string, unique?: boolean }>
   * - fileName?: string
   */
  collection(name, options = {}) {
    const key = name;
    if (this._collections.has(key)) return this._collections.get(key);
    const coll = new JSONCollection({
      name,
      dataDir: this.dataDir,
      ...options,
    });
    this._collections.set(key, coll);
    return coll;
  }
}

/**
 * Helpers
 */

function normalizeIndexes(indexes) {
  if (!indexes) return [];
  const out = [];
  for (const idx of indexes) {
    if (!idx) continue;
    if (typeof idx === 'string') {
      out.push({ field: idx, unique: false });
    } else if (typeof idx === 'object' && idx.field) {
      out.push({ field: idx.field, unique: !!idx.unique });
    }
  }
  return out;
}

function matchesQuery(rec, query) {
  if (!query || typeof query !== 'object') return true;
  for (const [k, v] of Object.entries(query)) {
    const rv = getByPath(rec, k);
    if (rv !== v) return false;
  }
  return true;
}

function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

module.exports = {
  JSONDatabase,
  JSONCollection,
  DatabaseError,
  atomicWriteJSON,
  readJSON,
};
