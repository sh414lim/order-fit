const { currentUser } = require('../_lib/session');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  try { const user = await currentUser(req); return res.status(200).json({ user }); }
  catch (error) { console.error(error); return res.status(500).json({ message: '세션을 확인할 수 없습니다.' }); }
};
