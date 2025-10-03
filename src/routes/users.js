'use strict';

const express = require('express');
const z = require('zod');

const { getModels } = require('../lib/models');
const { requireAuth, safeUser, hashPassword } = require('../lib/auth');
const { DatabaseError } = require('../lib/db');

const router = express.Router();

// Helpers

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getUserIdFromReq(req) {
  const payload = req.user || {};
  // Tokens were issued with sub = user.id and claims include uid too
  return payload.sub || payload.uid || null;
}

function isAdmin(req) {
  const roles = (req.user && req.user.roles) || [];
  return Array.isArray(roles) && roles.includes('admin');
}

const idParamSchema = z.object({
  id: z.string().uuid({ message: 'Invalid user id' }),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  limit: z
    .preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(100).optional())
    .default(25),
  offset: z
    .preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(0).optional())
    .default(0),
  sortBy: z.enum(['createdAt', 'updatedAt', 'email', 'name']).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

const patchSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(1, 'Name is required').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    // Admin-only fields (validated here but gated in handler)
    roles: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

// Protect all routes under this router
router.use(requireAuth());

// GET / - list users (admin only)
router.get('/', async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    const { q, limit, offset, sortBy, sortDir } = listQuerySchema.parse(req.query || {});
    const { users } = getModels();

    // The underlying DB supports equality filtering; implement search and sort in memory
    const allUsers = await users.all();

    // Search
    const filtered = q
      ? allUsers.filter((u) => {
          const email = (u.email || '').toLowerCase();
          const name = (u.name || '').toLowerCase();
          const s = q.toLowerCase();
          return email.includes(s) || name.includes(s);
        })
      : allUsers;

    // Sort
    const dir = sortDir === 'desc' ? -1 : 1;
    const sorted = filtered.slice().sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * dir;
      if (bv == null) return 1 * dir;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    // Paginate
    const total = sorted.length;
    const page = sorted.slice(offset, offset + limit);

    return res.json({
      items: page.map((u) => safeUser(u)),
      total,
      offset,
      limit,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: 'Invalid query parameters', details: err.issues },
      });
    }
    return next(err);
  }
});

// GET /:id - get user by id (self or admin)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params || {});
    const me = getUserIdFromReq(req);
    const admin = isAdmin(req);

    if (!admin && me !== id) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    const { users } = getModels();
    const user = await users.read(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    return res.json({ user: safeUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: 'Invalid request', details: err.issues },
      });
    }
    return next(err);
  }
});

// PATCH /:id - update user (self can update name/email/password; admin can also update roles/isActive)
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = idParamSchema.parse(req.params || {});
    const body = patchSchema.parse(req.body || {});
    const me = getUserIdFromReq(req);
    const admin = isAdmin(req);

    if (!admin && me !== id) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    const { users } = getModels();
    const existing = await users.read(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    const patch = {};

    if (body.email !== undefined) {
      patch.email = normalizeEmail(body.email);
    }
    if (body.name !== undefined) {
      patch.name = body.name;
    }
    if (body.password !== undefined) {
      patch.passwordHash = await hashPassword(body.password);
    }

    // Admin-only mutations
    if (admin) {
      if (body.roles !== undefined) {
        patch.roles = Array.isArray(body.roles) ? body.roles : [];
      }
      if (body.isActive !== undefined) {
        patch.isActive = !!body.isActive;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: { message: 'No updatable fields provided' } });
    }

    const updated = await users.update(id, patch);

    return res.json({ user: safeUser(updated) });
  } catch (err) {
    if (err instanceof DatabaseError && err.code === 'EINDEX_UNIQUE') {
      return res.status(409).json({ error: { message: 'Email already in use' } });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: 'Invalid request body', details: err.issues },
      });
    }
    return next(err);
  }
});

// DELETE /:id - delete user (admin only)
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    const { id } = idParamSchema.parse(req.params || {});
    const { users } = getModels();

    const removed = await users.remove(id);
    if (!removed) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    return res.status(204).end();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: 'Invalid request', details: err.issues },
      });
    }
    return next(err);
  }
});

module.exports = router;
