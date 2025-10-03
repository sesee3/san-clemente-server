'use strict';

const express = require('express');
const z = require('zod');

const { getModels } = require('../lib/models');
const {
  hashPassword,
  verifyPassword,
  issueTokenPair,
  requireAuth,
  getTokenFromRequest,
  verifyToken,
  safeUser,
} = require('../lib/auth');
const { DatabaseError } = require('../lib/db');

const router = express.Router();

// Schemas
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required').optional(), // optional to allow Authorization header
});

// Helpers
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function tokensResponseForUser(user) {
  const claims = {
    uid: user.id,
    email: user.email,
    roles: Array.isArray(user.roles) ? user.roles : [],
  };
  const tokens = issueTokenPair(user, claims);
  return tokens;
}

// Routes

// POST /register
// Body: { email, name, password }
// Response: { user, tokens }
router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body || {});
    const email = normalizeEmail(body.email);
    const { users } = getModels();

    // Check if user already exists
    const existing = await users.findOne({ email });
    if (existing) {
      return res.status(409).json({
        error: { message: 'Email already in use' },
      });
    }

    const passwordHash = await hashPassword(body.password);

    const user = await users.create({
      email,
      name: body.name,
      passwordHash,
      roles: [],
      isActive: true,
    });

    const tokens = tokensResponseForUser(user);

    return res.status(201).json({
      user: safeUser(user),
      tokens,
    });
  } catch (err) {
    // Handle unique index violations from DB layer
    if (err instanceof DatabaseError && err.code === 'EINDEX_UNIQUE') {
      return res.status(409).json({
        error: { message: 'Email already in use' },
      });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: 'Invalid request body', details: err.issues },
      });
    }
    return next(err);
  }
});

// POST /login
// Body: { email, password }
// Response: { user, tokens }
router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body || {});
    const email = normalizeEmail(body.email);
    const { users } = getModels();

    const user = await users.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid credentials' } });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: { message: 'User is disabled' } });
    }

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: { message: 'Invalid credentials' } });
    }

    // Update lastLoginAt
    await users.update(user.id, { lastLoginAt: new Date().toISOString() });

    const tokens = tokensResponseForUser(user);

    return res.json({
      user: safeUser(user),
      tokens,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: 'Invalid request body', details: err.issues },
      });
    }
    return next(err);
  }
});

// POST /refresh
// Body: { refreshToken } or Authorization: Bearer <refreshToken>
// Response: { tokens }
router.post('/refresh', async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body || {});
    const headerToken = getTokenFromRequest(req);
    const token = body.refreshToken || headerToken;

    if (!token) {
      return res.status(400).json({
        error: { message: 'Missing refresh token' },
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyToken(token, 'refresh');
    } catch (_e) {
      return res.status(401).json({
        error: { message: 'Invalid or expired refresh token' },
      });
    }

    const sub = decoded && decoded.sub;
    if (!sub) {
      return res.status(401).json({
        error: { message: 'Invalid token subject' },
      });
    }

    const { users } = getModels();
    const user = await users.read(sub);
    if (!user || user.isActive === false) {
      return res.status(401).json({
        error: { message: 'User not found or inactive' },
      });
    }

    const tokens = tokensResponseForUser(user);
    return res.json({ tokens });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: { message: 'Invalid request body', details: err.issues },
      });
    }
    return next(err);
  }
});

// GET /me
// Requires Authorization: Bearer <accessToken>
// Response: { user, token: { sub, iat, exp, ... } }
router.get('/me', requireAuth(), async (req, res, next) => {
  try {
    const payload = req.user || {};
    const sub = payload && payload.sub;
    if (!sub) {
      return res.status(401).json({ error: { message: 'Unauthorized' } });
    }
    const { users } = getModels();
    const user = await users.read(sub);
    if (!user || user.isActive === false) {
      return res.status(401).json({ error: { message: 'Unauthorized' } });
    }
    return res.json({
      user: safeUser(user),
      token: payload,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
