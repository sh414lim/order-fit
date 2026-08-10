const crypto = require('crypto');
const { database } = require('./db');

const SESSION_COOKIE = 'orderfit_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}
function verifyPassword(password, encoded) {
  const [salt, expected] = String(encoded).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await database().query('insert into public.orderfit_user_sessions (user_id, token_hash, expires_at) values ($1, $2, $3)', [userId, hash(token), expiresAt]);
  return token;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function cookieToken(req) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`));
  return match?.[1];
}
async function currentUser(req) {
  const token = cookieToken(req);
  if (!token) return null;
  const { rows } = await database().query(
    `select a.id, a.email, a.display_name, a.is_active
       from public.orderfit_user_sessions s
       join public.orderfit_user_accounts a on a.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and a.is_active`, [hash(token)]
  );
  return rows[0] || null;
}
async function currentMembership(req, roles = []) {
  const user = await currentUser(req);
  if (!user) return null;
  const { rows } = await database().query(
    `select m.organization_id, m.role, o.name as organization_name from public.orderfit_user_memberships m join public.timefit_organizations o on o.id=m.organization_id where m.user_id=$1 order by m.created_at asc limit 1`, [user.id]
  );
  const membership = rows[0];
  if (!membership || (roles.length && !roles.includes(membership.role))) return null;
  return { user, ...membership };
}
function validCredentials(email, password) { return /^\S+@\S+\.\S+$/.test(email) && typeof password === 'string' && password.length >= 8; }

module.exports = { clearSessionCookie, createSession, currentMembership, currentUser, passwordHash, setSessionCookie, validCredentials, verifyPassword };
