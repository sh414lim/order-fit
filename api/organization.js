const { database } = require('./_lib/db');
const { currentUser } = require('./_lib/session');

module.exports = async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ message: '로그인이 필요합니다.' });
  try {
    if (req.method === 'GET') {
      const { rows } = await database().query(
        `select m.organization_id as id, o.name, m.role
           from public.orderfit_user_memberships m
           join public.timefit_organizations o on o.id = m.organization_id
          where m.user_id = $1 order by m.created_at asc limit 1`, [user.id]
      );
      return res.status(200).json({ organization: rows[0] || null });
    }
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: '매장명을 입력해 주세요.' });
    const client = await database().connect();
    try {
      await client.query('begin');
      const { rows } = await client.query('insert into public.timefit_organizations(name) values ($1) returning id, name', [name]);
      await client.query("insert into public.orderfit_user_memberships (organization_id, user_id, role, assigned_by) values ($1, $2, 'admin', $2)", [rows[0].id, user.id]);
      await client.query('commit');
      return res.status(201).json({ organization: { ...rows[0], role: 'admin' } });
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  } catch (error) { console.error(error); return res.status(500).json({ message: '매장 정보를 처리할 수 없습니다.' }); }
};
