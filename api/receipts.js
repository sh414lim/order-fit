const { database } = require('./_lib/db');
const { currentMembership } = require('./_lib/session');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const member = await currentMembership(req);
  if (!member) return res.status(401).json({ message:'로그인이 필요합니다.' });
  const { vendorName, receiptDate, imageData } = req.body || {};
  if (!vendorName || !receiptDate) return res.status(400).json({message:'업체와 발주 날짜를 입력해 주세요.'});
  if (imageData && String(imageData).length > 5_500_000) return res.status(413).json({message:'이미지는 4MB 이하로 올려 주세요.'});
  const client = await database().connect();
  try {
    await client.query('begin');
    let vendor = (await client.query('select * from public.orderfit_user_vendors where organization_id=$1 and name=$2',[member.organization_id,vendorName])).rows[0];
    if (!vendor && ['admin','manager'].includes(member.role)) vendor = (await client.query("insert into public.orderfit_user_vendors(organization_id,name,default_zone) values($1,$2,'shared') returning *",[member.organization_id,vendorName])).rows[0];
    const receipt = (await client.query(`insert into public.orderfit_user_receipts(organization_id,vendor_id,vendor_name,receipt_date,image_data,status,uploaded_by) values($1,$2,$3,$4,$5,'review_required',$6) returning *`,[member.organization_id,vendor?.id||null,vendorName,receiptDate,imageData||null,member.user.id])).rows[0];
    await client.query(`insert into public.orderfit_user_receipt_lines(receipt_id,organization_id,name,zone,quantity,unit,unit_price,amount,sort_order) values($1,$2,'OCR 분석 대기','shared',1,'개',0,0,0)`,[receipt.id,member.organization_id]);
    await client.query('commit'); return res.status(201).json({receipt});
  } catch(error) { await client.query('rollback'); console.error(error); return res.status(500).json({message:'영수증 등록에 실패했습니다.'}); } finally { client.release(); }
};
