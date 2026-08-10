const { database } = require('../_lib/db');
const { createSession, setSessionCookie, validCredentials, verifyPassword } = require('../_lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const { email = '', password = '' } = req.body || {};
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!validCredentials(normalizedEmail, password)) return res.status(400).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  try {
    const { rows } = await database().query('select id, email, display_name, password_hash, is_active from public.orderfit_user_accounts where email = $1', [normalizedEmail]);
    const user = rows[0];
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    setSessionCookie(res, await createSession(user.id));
    return res.status(200).json({ user: { id: user.id, email: user.email, display_name: user.display_name } });
  } catch (error) { console.error(error); return res.status(500).json({ message: '로그인 처리에 실패했습니다.' }); }
};
