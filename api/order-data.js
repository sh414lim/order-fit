const { database } = require('./_lib/db');
const { currentMembership } = require('./_lib/session');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const member = await currentMembership(req);
  if (!member) return res.status(401).json({ message: '로그인이 필요합니다.' });
  const org = member.organization_id;
  const [vendors, items, receipts, lines, inventory] = await Promise.all([
    database().query('select * from public.orderfit_user_vendors where organization_id=$1 and is_active order by name',[org]),
    database().query('select * from public.orderfit_user_items where organization_id=$1 and is_active order by name',[org]),
    database().query('select * from public.orderfit_user_receipts where organization_id=$1 order by receipt_date desc, created_at desc',[org]),
    database().query('select * from public.orderfit_user_receipt_lines where organization_id=$1 order by sort_order',[org]),
    database().query('select item_id, quantity_delta from public.orderfit_user_inventory_transactions where organization_id=$1',[org])
  ]);
  return res.status(200).json({ organization:{id:org,name:member.organization_name,role:member.role}, vendors:vendors.rows, items:items.rows, receipts:receipts.rows, lines:lines.rows, inventory:inventory.rows });
};
