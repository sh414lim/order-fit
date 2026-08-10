const { clearSessionCookie } = require('../_lib/session');
module.exports = async (req, res) => { if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' }); clearSessionCookie(res); return res.status(204).end(); };
