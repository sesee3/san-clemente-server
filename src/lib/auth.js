'use strict';

/**
 * Auth utilities
 * - Password hashing and verification (bcryptjs)
 * - JWT issuing and verification (jsonwebtoken)
 * - Request helpers for extracting/validating Bearer tokens
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Password hashing
const DEFAULT_BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

// JWT configuration
const JWT_ALGORITHM = process.env.JWT_ALGORITHM || 'HS256';
const DEFAULT_ISSUER = process.env.JWT_ISSUER || undefined;
const DEFAULT_AUDIENCE = process.env.JWT_AUDIENCE || undefined;

const DEFAULT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const DEFAULT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Secret resolution:
// - Prefer type-specific secrets if provided (JWT_ACCESS_SECRET / JWT_REFRESH_SECRET)
// - Fallback to JWT_SECRET
function getJwtSecret(type = 'access') {
  const globalSecret = process.env.JWT_SECRET;
  const accessSecret = process.env.JWT_ACCESS_SECRET || globalSecret;
  const refreshSecret = process.env.JWT_REFRESH_SECRET || globalSecret;

  const secret = type === 'refresh' ? refreshSecret : accessSecret;
  if (!secret || String(secret).trim().length === 0) {
    const varName =
      type === 'refresh'
        ? 'JWT_REFRESH_SECRET or JWT_SECRET'
        : 'JWT_ACCESS_SECRET or JWT_SECRET';
    const err = new Error(
      `Missing JWT secret. Please set ${varName} in environment variables.`
    );
    err.code = 'EJWT_SECRET_MISSING';
    throw err;
  }
  return secret;
}

// Parse simple duration strings like "15m", "7d", "1h", "30s" to seconds
function parseDurationToSeconds(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return Math.max(0, Math.floor(input));
  }
  if (typeof input !== 'string') return 0;
  const m = input.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const map = {
    ms: 1 / 1000,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  const factor = map[unit] || 1;
  return Math.max(0, Math.floor(num * factor));
}

/**
 * Hash a plaintext password.
 * @param {string} password
 * @param {number} [rounds=DEFAULT_BCRYPT_ROUNDS]
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(password, rounds = DEFAULT_BCRYPT_ROUNDS) {
  if (typeof password !== 'string' || password.length === 0) {
    const err = new Error('Password must be a non-empty string');
    err.code = 'EPASSWORD_INVALID';
    throw err;
  }
  const cost = Math.min(15, Math.max(8, Number(rounds) || DEFAULT_BCRYPT_ROUNDS));
  const salt = await bcrypt.genSalt(cost);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a plaintext password against a stored hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  if (!hash || typeof hash !== 'string') return false;
  if (typeof password !== 'string') return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Internal: base signer
 */
function signToken(payload, { type = 'access', expiresIn, subject, issuer, audience, jwtid } = {}) {
  const secret = getJwtSecret(type);
  const opts = {
    algorithm: JWT_ALGORITHM,
    expiresIn:
      expiresIn ||
      (type === 'refresh' ? DEFAULT_REFRESH_EXPIRES_IN : DEFAULT_ACCESS_EXPIRES_IN),
    subject: subject,
    issuer: issuer ?? DEFAULT_ISSUER,
    audience: audience ?? DEFAULT_AUDIENCE,
    jwtid: jwtid || uuidv4(),
  };
  // Remove undefined fields so jsonwebtoken doesn't complain
  Object.keys(opts).forEach((k) => opts[k] === undefined && delete opts[k]);
  return jwt.sign(payload || {}, secret, opts);
}

/**
 * Verify a JWT and return its decoded payload.
 * Throws on invalid/expired tokens.
 * @param {string} token
 * @param {'access'|'refresh'} [type='access']
 * @param {{issuer?:string, audience?:string, subject?:string}} [expect={}]
 * @returns {object} decoded payload
 */
function verifyToken(token, type = 'access', expect = {}) {
  const secret = getJwtSecret(type);
  const opts = {
    algorithms: [JWT_ALGORITHM],
    issuer: expect.issuer ?? DEFAULT_ISSUER,
    audience: expect.audience ?? DEFAULT_AUDIENCE,
    subject: expect.subject,
  };
  Object.keys(opts).forEach((k) => opts[k] === undefined && delete opts[k]);
  return jwt.verify(token, secret, opts);
}

/**
 * Decode a JWT without verifying (useful for debugging).
 * @param {string} token
 * @param {boolean} [complete=false] return header+payload+signature
 * @returns {object|null}
 */
function decodeToken(token, complete = false) {
  try {
    return jwt.decode(token, { complete });
  } catch {
    return null;
  }
}

/**
 * Convenience: sign an access token
 * @param {object} claims - JWT claims (will be in payload)
 * @param {object} [options]
 * @returns {string} JWT
 */
function signAccessToken(claims, options = {}) {
  return signToken(claims, { ...options, type: 'access' });
}

/**
 * Convenience: sign a refresh token
 * @param {object} claims
 * @param {object} [options]
 * @returns {string} JWT
 */
function signRefreshToken(claims, options = {}) {
  return signToken(claims, { ...options, type: 'refresh' });
}

/**
 * Issue a pair of tokens (access + refresh) for a user.
 * - user should include an 'id' field used as the subject (sub)
 * - additional claims can be included via claims argument
 * @param {object} user
 * @param {object} [claims] additional payload claims for access token
 * @param {object} [options]
 * @returns {{
 *   accessToken: string,
 *   refreshToken: string,
 *   tokenType: 'Bearer',
 *   accessTokenExpiresIn: number,
 *   refreshTokenExpiresIn: number
 * }}
 */
function issueTokenPair(user, claims = {}, options = {}) {
  const sub = user && (user.id || user._id || user.uuid);
  if (!sub) {
    const err = new Error('User identifier is required to issue tokens (id/_id/uuid)');
    err.code = 'EUSER_ID_MISSING';
    throw err;
  }

  const accessExpires = options.accessExpiresIn || DEFAULT_ACCESS_EXPIRES_IN;
  const refreshExpires = options.refreshExpiresIn || DEFAULT_REFRESH_EXPIRES_IN;

  const accessToken = signAccessToken(
    { ...claims },
    { subject: String(sub), expiresIn: accessExpires }
  );
  const refreshToken = signRefreshToken(
    { tid: uuidv4() }, // token id claim for refresh tracking/rotation
    { subject: String(sub), expiresIn: refreshExpires }
  );

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    accessTokenExpiresIn: parseDurationToSeconds(accessExpires),
    refreshTokenExpiresIn: parseDurationToSeconds(refreshExpires),
  };
}

/**
 * Extract a Bearer token from an HTTP request.
 * Looks in:
 * - Authorization header: "Bearer <token>"
 * - req.cookies.access_token (if present)
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function getTokenFromRequest(req) {
  if (!req || typeof req !== 'object') return null;

  const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (typeof auth === 'string') {
    const m = auth.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (m) return m[1];
  }
  // Optional cookie lookup if cookie-parser middleware is used upstream
  if (req.cookies && typeof req.cookies.access_token === 'string') {
    return req.cookies.access_token;
  }
  return null;
}

/**
 * Express middleware enforcing a valid access token.
 * - Attaches decoded payload to req.user
 * - 401 on missing/invalid token unless options.optional = true
 * @param {{optional?: boolean}} [options]
 * @returns {import('express').RequestHandler}
 */
function requireAuth(options = {}) {
  const { optional = false } = options;
  return (req, res, next) => {
    try {
      const token = getTokenFromRequest(req);
      if (!token) {
        if (optional) {
          req.user = null;
          return next();
        }
        return res
          .status(401)
          .json({ error: { message: 'Unauthorized: token missing' } });
      }
      const payload = verifyToken(token, 'access', {
        // If you want to enforce issuer/audience/subject, pass in options
      });
      req.user = payload || null;
      return next();
    } catch (err) {
      if (optional) {
        req.user = null;
        return next();
      }
      const status =
        err && (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError')
          ? 401
          : 400;
      return res
        .status(status)
        .json({ error: { message: 'Unauthorized: invalid or expired token' } });
    }
  };
}

/**
 * Strip sensitive fields from a user object before sending to clients.
 * @param {object} user
 * @param {string[]} [extraFieldsToOmit=[]]
 * @returns {object}
 */
function safeUser(user, extraFieldsToOmit = []) {
  if (!user || typeof user !== 'object') return {};
  const omit = new Set(['password', 'passwordHash', 'salt', ...extraFieldsToOmit]);
  const out = {};
  for (const [k, v] of Object.entries(user)) {
    if (!omit.has(k)) out[k] = v;
  }
  return out;
}

module.exports = {
  // Password helpers
  hashPassword,
  verifyPassword,

  // JWT helpers
  signToken,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  decodeToken,
  issueTokenPair,
  getTokenFromRequest,

  // Express middleware
  requireAuth,

  // Misc
  safeUser,
  parseDurationToSeconds,
  getJwtSecret,
};
