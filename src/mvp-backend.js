/* Order data currently uses Supabase RLS. Account creation and login are
   standalone OrderFit server sessions, with no email-confirmation dependency. */
(function () {
  const SUPABASE_URL = 'https://nzxgcfwranspxynzyglb.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K-YKPSyZpOmMo9CupeWLwA_X_CpLL_T';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const context = { user: null, organization: null, vendors: [], items: [], ready: false };
  let authMode = 'login';
  window.OrderFitBackend = { client, context };

  const koreanStatus = { uploaded: '검토 필요', processing: '검토 필요', review_required: '검토 필요', confirmed: '확정', rejected: '반려' };
  const dbStatus = { '검토 필요': 'review_required', '확정': 'confirmed', '반려': 'rejected' };
  const roleLabel = { admin: '관리자', manager: '매니저', kitchen: '주방', hall: '홀', staff: '직원' };
  const api = async (path, options = {}) => {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '요청을 처리할 수 없습니다.');
    return payload;
  };
  const toast = (message, type = '') => { const element = document.getElementById('mvp-toast'); element.textContent = message; element.className = `mvp-toast show ${type}`; setTimeout(() => { element.className = 'mvp-toast'; }, 3500); };
  const validCredentials = (email, password, message) => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { message.textContent = '올바른 이메일 주소를 입력해 주세요.'; return false; }
    if (password.length < 8) { message.textContent = '비밀번호는 8자 이상 입력해 주세요.'; return false; }
    return true;
  };
  const setAuthMode = mode => {
    authMode = mode;
    const isSignup = mode === 'signup';
    document.getElementById('auth-title').textContent = isSignup ? '관리자 계정 만들기' : '관리자 로그인';
    document.getElementById('auth-description').textContent = isSignup ? '첫 매장을 생성한 계정은 관리자로 등록됩니다.' : '발주 기록과 영수증을 안전하게 관리합니다.';
    document.getElementById('auth-submit').textContent = isSignup ? '관리자 계정 만들기' : '로그인';
    document.getElementById('signup-button').textContent = isSignup ? '로그인 화면으로 돌아가기' : '새 관리자 계정 만들기';
    document.getElementById('password-confirmation-field').hidden = !isSignup;
    document.getElementById('auth-password').autocomplete = isSignup ? 'new-password' : 'current-password';
    document.getElementById('auth-message').textContent = '';
  };
  const activePage = () => document.querySelector('.nav-item.active')?.dataset.page || 'dashboard';
  const formatDate = value => String(value).replaceAll('-', '.');
  const databaseError = (error, fallback) => { console.error(error); toast(error?.message || fallback, 'error'); };
  const canManageOrders = () => ['admin', 'manager'].includes(context.organization?.role);

  async function resolveOrganization() {
    const { organization } = await api('/api/organization');
    return organization;
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
      const savedVendor = context.vendors.find(entry => entry.name.toLowerCase() === vendorName.toLowerCase());
      const vendor = savedVendor || (canManageOrders() ? await ensureVendor(vendorName) : null);
      const { data: receipt, error: receiptError } = await client.from('timefit_receipts').insert({ organization_id: context.organization.id, vendor_id: vendor?.id || null, vendor_name_raw: vendor?.name || vendorName, receipt_date: date, status: 'review_required', uploaded_by: context.user.id }).select().single();
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
    if (!canManageOrders()) { toast('발주 검토와 확정은 관리자 또는 매니저만 할 수 있습니다.', 'error'); return; }
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
    try { context.organization = (await api('/api/organization', { method: 'POST', body: JSON.stringify({ name }) })).organization; }
    catch (error) { message.textContent = error.message; return; }
    document.getElementById('organization-dialog').close();
    context.ready = true;
    document.getElementById('organization-label').textContent = context.organization.name;
    document.getElementById('account-button').textContent = '로그아웃 · 관리자';
    render(activePage());
    toast('매장 설정을 완료했습니다.');
  }

  async function startAuthenticatedApp(user) {
    context.user = user;
    context.organization = await resolveOrganization();
    if (!context.organization) { document.getElementById('organization-dialog').showModal(); return; }
    document.getElementById('account-button').textContent = `로그아웃 · ${roleLabel[context.organization.role] || '직원'}`;
    context.ready = true;
    document.getElementById('organization-label').textContent = context.organization.name;
    render(activePage());
  }

  async function authenticate(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const message = document.getElementById('auth-message');
    if (!validCredentials(email, password, message)) return;
    message.textContent = '로그인 중…';
    try { const { user } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); document.getElementById('auth-dialog').close(); await startAuthenticatedApp(user); }
    catch (error) { message.textContent = error.message; }
  }

  async function signUp(event) {
    event?.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirmation = document.getElementById('auth-password-confirmation').value;
    const message = document.getElementById('auth-message');
    if (!validCredentials(email, password, message)) return;
    if (password !== confirmation) { message.textContent = '비밀번호 확인이 일치하지 않습니다.'; return; }
    message.textContent = '계정을 만들고 있습니다…';
    try { const { user } = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, displayName: email.split('@')[0] }) }); document.getElementById('auth-dialog').close(); await startAuthenticatedApp(user); }
    catch (error) { message.textContent = error.message; }
  }

  document.getElementById('auth-form').addEventListener('submit', event => authMode === 'signup' ? signUp(event) : authenticate(event));
  document.getElementById('signup-button').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
  document.getElementById('organization-form').addEventListener('submit', completeOrganization);
  document.getElementById('account-button').addEventListener('click', async () => {
    if (context.user) { await api('/api/auth/logout', { method: 'POST' }); context.user = null; context.ready = false; document.getElementById('account-button').textContent = '로그인'; setAuthMode('login'); document.getElementById('auth-dialog').showModal(); }
    else document.getElementById('auth-dialog').showModal();
  });

  api('/api/auth/me').then(({ user }) => user ? startAuthenticatedApp(user).catch(error => databaseError(error, '매장 데이터를 불러올 수 없습니다.')) : document.getElementById('auth-dialog').showModal()).catch(() => document.getElementById('auth-dialog').showModal());
}());
