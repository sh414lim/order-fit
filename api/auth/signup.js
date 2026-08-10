const { database } = require('../_lib/db');
const { createSession, passwordHash, setSessionCookie, validCredentials } = require('../_lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const { email = '', password = '', displayName = '' } = req.body || {};
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!validCredentials(normalizedEmail, password)) return res.status(400).json({ message: '이메일과 8자 이상의 비밀번호를 입력해 주세요.' });
  try {
    const { rows } = await database().query(
      'insert into public.orderfit_user_accounts (email, password_hash, display_name) values ($1, $2, $3) returning id, email, display_name',
      [normalizedEmail, passwordHash(password), String(displayName).trim() || normalizedEmail.split('@')[0]]
    );
    const user = rows[0];
    setSessionCookie(res, await createSession(user.id));
    return res.status(201).json({ user });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: '이미 등록된 이메일입니다. 로그인을 시도해 주세요.' });
    console.error(error);
    return res.status(500).json({ message: '회원가입 처리에 실패했습니다.' });
  }
};
