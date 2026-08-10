/* Supabase-backed MVP adapter. The publishable key is safe for browser use; RLS
   in the database enforces organization membership and role permissions. */
(function () {
  const SUPABASE_URL = 'https://nzxgcfwranspxynzyglb.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K-YKPSyZpOmMo9CupeWLwA_X_CpLL_T';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const context = { user: null, organization: null, vendors: [], items: [], ready: false };
  window.OrderFitBackend = { client, context };

  const koreanStatus = { uploaded: '검토 필요', processing: '검토 필요', review_required: '검토 필요', confirmed: '확정', rejected: '반려' };
  const dbStatus = { '검토 필요': 'review_required', '확정': 'confirmed', '반려': 'rejected' };
  const toast = (message, type = '') => { const element = document.getElementById('mvp-toast'); element.textContent = message; element.className = `mvp-toast show ${type}`; setTimeout(() => { element.className = 'mvp-toast'; }, 3500); };
  const activePage = () => document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
  const formatDate = value => String(value).replaceAll('-', '.');
  const databaseError = (error, fallback) => { console.error(error); toast(error?.message || fallback, 'error'); };

  async function resolveOrganization() {
    const { data, error } = await client.from('timefit_organization_members').select('organization_id, role, timefit_organizations(id,name)').eq('user_id', context.user.id).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.organization_id, role: data.role, name: data.timefit_organizations.name };
  }

  async function signedImage(path) {
    if (!path) return '';
    const { data } = await client.storage.from('timefit_receipts').createSignedUrl(path, 60 * 60);
    return data?.signedUrl || '';
  }

  async function loadData() {
    if (!context.organization) return;
    const orgId = context.organization.id;
    const [{ data: vendors, error: vendorsError }, { data: items, error: itemsError }, { data: receipts, error: receiptsError }, { data: lines, error: linesError }, { data: inventory, error: inventoryError }] = await Promise.all([
      client.from('timefit_vendors').select('*').eq('organization_id', orgId).eq('is_active', true).order('name'),
      client.from('timefit_items').select('*').eq('organization_id', orgId).eq('is_active', true).order('name'),
      client.from('timefit_receipts').select('*').eq('organization_id', orgId).order('receipt_date', { ascending: false }),
      client.from('timefit_receipt_lines').select('*').eq('organization_id', orgId).order('sort_order'),
      client.from('timefit_inventory_transactions').select('item_id,quantity_delta').eq('organization_id', orgId)
    ]);
    if (vendorsError || itemsError || receiptsError || linesError || inventoryError) throw vendorsError || itemsError || receiptsError || linesError || inventoryError;
    context.vendors = vendors || [];
    context.items = items || [];
    const linesByReceipt = (lines || []).reduce((map, line) => { (map[line.receipt_id] ||= []).push(line); return map; }, {});
    const vendorById = new Map(context.vendors.map(vendor => [vendor.id, vendor]));
    const stockByItem = (inventory || []).reduce((map, row) => { map[row.item_id] = (map[row.item_id] || 0) + Number(row.quantity_delta); return map; }, {});
    const nextReceipts = await Promise.all((receipts || []).map(async receipt => ({
      id: receipt.id, vendor: vendorById.get(receipt.vendor_id)?.name || receipt.vendor_name_raw || '업체 확인 필요', date: formatDate(receipt.receipt_date), total: Number(receipt.total_amount), status: koreanStatus[receipt.status] || '검토 필요', lines: (linesByReceipt[receipt.id] || []).length, imageUrl: await signedImage(receipt.image_path), items: (linesByReceipt[receipt.id] || []).map(line => line.raw_name), db: receipt
    })));
    state.receipts.splice(0, state.receipts.length, ...nextReceipts);
    state.inventory.splice(0, state.inventory.length, ...context.items.map(item => ({ name: item.name, category: item.category || '미분류', stock: stockByItem[item.id] || 0, unit: item.base_unit, minimum: Number(item.minimum_stock), usage: 0, vendor: '' })));
    document.getElementById('organization-label').textContent = context.organization.name;
    context.ready = true;
    render(activePage());
  }

  async function ensureItem(rawName, zone = 'kitchen') {
    let item = context.items.find(entry => entry.name.toLowerCase() === rawName.toLowerCase());
    if (item) return item;
    const { data, error } = await client.from('timefit_items').insert({ organization_id: context.organization.id, name: rawName, category: '미분류', zone, base_unit: '개', minimum_stock: 0 }).select().single();
    if (error) throw error;
    context.items.push(data);
    return data;
  }

  async function ensureVendor(name) {
    let vendor = context.vendors.find(entry => entry.name.toLowerCase() === name.toLowerCase());
    if (vendor) return vendor;
    const { data, error } = await client.from('timefit_vendors').insert({ organization_id: context.organization.id, name, default_zone: 'kitchen' }).select().single();
    if (error) throw error;
    context.vendors.push(data);
    return data;
  }

  window.addReceiptFromUpload = async function (file) {
    if (!context.ready) { toast('로그인과 매장 설정을 먼저 완료해 주세요.', 'error'); return; }
    const date = document.getElementById('receipt-date').value;
    const vendorName = document.getElementById('receipt-vendor').value;
    try {
      const vendor = await ensureVendor(vendorName);
      const { data: receipt, error: receiptError } = await client.from('timefit_receipts').insert({ organization_id: context.organization.id, vendor_id: vendor.id, vendor_name_raw: vendor.name, receipt_date: date, status: 'review_required', uploaded_by: context.user.id }).select().single();
      if (receiptError) throw receiptError;
      let imagePath = '';
      if (file.type.startsWith('image/')) {
        const extension = file.name.split('.').pop() || 'jpg';
        imagePath = `${context.organization.id}/${receipt.id}/original.${extension}`;
        const { error: uploadError } = await client.storage.from('timefit_receipts').upload(imagePath, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        const { error: imageUpdateError } = await client.from('timefit_receipts').update({ image_path: imagePath }).eq('id', receipt.id);
        if (imageUpdateError) throw imageUpdateError;
      }
      const { error: lineError } = await client.from('timefit_receipt_lines').insert({ receipt_id: receipt.id, organization_id: context.organization.id, raw_name: 'OCR 분석 대기', normalized_name: 'OCR 분석 대기', zone: 'kitchen', quantity: 1, unit: '개', unit_price: 0, amount: 0, sort_order: 0 });
      if (lineError) throw lineError;
      document.getElementById('receipt-dialog').close();
      await loadData();
      toast('영수증을 등록했습니다. 품목과 금액을 검토해 확정하세요.');
    } catch (error) { databaseError(error, '영수증 등록에 실패했습니다.'); }
  };

  async function confirmReceiptInDatabase(id) {
    if (!context.ready) return;
    const receipt = state.receipts.find(entry => String(entry.id) === String(id));
    if (!receipt) return;
    try {
      const rawNames = [...document.querySelectorAll('.review-name')].map(input => input.value.trim()).filter(Boolean);
      const amounts = [...document.querySelectorAll('.review-amount')].map(input => Number(input.value.replaceAll(',', '')) || 0);
      if (!rawNames.length) throw new Error('최소 한 개의 품목이 필요합니다.');
      const vendor = await ensureVendor(document.getElementById('review-vendor').value.trim() || receipt.vendor);
      const receiptDate = document.getElementById('review-date').value;
      const lines = await Promise.all(rawNames.map(async (name, index) => ({ receipt_id: id, organization_id: context.organization.id, item_id: (await ensureItem(name)).id, raw_name: name, normalized_name: name, zone: 'kitchen', quantity: 1, unit: '개', unit_price: amounts[index], amount: amounts[index], sort_order: index })));
      const { error: receiptError } = await client.from('timefit_receipts').update({ vendor_id: vendor.id, vendor_name_raw: vendor.name, receipt_date: receiptDate, status: 'review_required' }).eq('id', id);
      if (receiptError) throw receiptError;
      const { error: deleteError } = await client.from('timefit_receipt_lines').delete().eq('receipt_id', id);
      if (deleteError) throw deleteError;
      const { error: linesError } = await client.from('timefit_receipt_lines').insert(lines);
      if (linesError) throw linesError;
      const { error: confirmError } = await client.rpc('timefit_confirm_receipt', { target_receipt_id: id });
      if (confirmError) throw confirmError;
      await loadData();
      toast('발주를 확정하고 재고 입고에 반영했습니다.');
    } catch (error) { databaseError(error, '발주 확정에 실패했습니다.'); }
  }

  document.addEventListener('click', event => {
    const confirmButton = event.target.closest('[data-review-confirm]');
    if (confirmButton && context.ready) { event.preventDefault(); event.stopImmediatePropagation(); confirmReceiptInDatabase(confirmButton.dataset.reviewConfirm); }
  }, true);

  async function completeOrganization(event) {
    event.preventDefault();
    const name = document.getElementById('organization-name').value.trim();
    const message = document.getElementById('organization-message');
    if (!name) return;
    message.textContent = '매장을 생성하고 있습니다…';
    const { data, error } = await client.rpc('timefit_bootstrap_organization', { organization_name: name });
    if (error) { message.textContent = error.message; return; }
    context.organization = { id: data, name, role: 'admin' };
    document.getElementById('organization-dialog').close();
    await loadData();
    toast('매장 설정을 완료했습니다. 첫 영수증을 등록해 보세요.');
  }

  async function startAuthenticatedApp(session) {
    context.user = session.user;
    document.getElementById('account-button').textContent = '로그아웃';
    context.organization = await resolveOrganization();
    if (!context.organization) { document.getElementById('organization-dialog').showModal(); return; }
    await loadData();
  }

  async function authenticate(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const message = document.getElementById('auth-message');
    message.textContent = '로그인 중…';
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) { message.textContent = error.message; return; }
    document.getElementById('auth-dialog').close();
    await startAuthenticatedApp(data.session);
  }

  async function signUp() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const message = document.getElementById('auth-message');
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: email.split('@')[0] }, emailRedirectTo: window.location.origin } });
    if (error) { message.textContent = error.message; return; }
    message.textContent = data.session ? '계정이 생성되었습니다.' : '확인 이메일을 열어 계정을 활성화한 뒤 로그인해 주세요.';
  }

  document.getElementById('auth-form').addEventListener('submit', authenticate);
  document.getElementById('signup-button').addEventListener('click', signUp);
  document.getElementById('organization-form').addEventListener('submit', completeOrganization);
  document.getElementById('account-button').addEventListener('click', async () => {
    if (context.user) { await client.auth.signOut(); context.user = null; context.ready = false; document.getElementById('account-button').textContent = '로그인'; document.getElementById('auth-dialog').showModal(); }
    else document.getElementById('auth-dialog').showModal();
  });

  client.auth.onAuthStateChange((_event, session) => { if (!session && context.user) { context.user = null; context.ready = false; document.getElementById('auth-dialog').showModal(); } });
  client.auth.getSession().then(({ data, error }) => { if (error) databaseError(error, '세션을 불러올 수 없습니다.'); else if (data.session) startAuthenticatedApp(data.session).catch(error => databaseError(error, '매장 데이터를 불러올 수 없습니다.')); else document.getElementById('auth-dialog').showModal(); });
}());
