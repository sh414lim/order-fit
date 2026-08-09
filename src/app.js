const money = new Intl.NumberFormat('ko-KR');
const seedState = {
  receipts: [
    { id: 1, vendor: '푸른식자재', date: '2026.08.08', total: 248000, status: '검토 필요', lines: 6 },
    { id: 2, vendor: '한성정육', date: '2026.08.07', total: 415000, status: '확정', lines: 4 },
    { id: 3, vendor: '그린패키지', date: '2026.08.05', total: 89200, status: '확정', lines: 8 }
  ],
  inventory: [
    { name: '양파', category: '채소', stock: 16, unit: 'kg', minimum: 8, usage: 3.5, vendor: '푸른식자재' },
    { name: '대파', category: '채소', stock: 4, unit: 'kg', minimum: 6, usage: 2.1, vendor: '푸른식자재' },
    { name: '식용유', category: '소스·유지', stock: 22, unit: 'L', minimum: 18, usage: 1.2, vendor: '그린패키지' },
    { name: '한우 등심', category: '육류', stock: 7, unit: 'kg', minimum: 5, usage: 1.1, vendor: '한성정육' }
  ]
};
const state = JSON.parse(localStorage.getItem('orderfit-demo-state') || JSON.stringify(seedState));
function persist() { localStorage.setItem('orderfit-demo-state', JSON.stringify(state)); }
let activeZone = 'kitchen';

const pages = {
  dashboard: { title: '좋은 아침이에요, 민지님', render: dashboard },
  receipts: { title: '영수증 관리', render: receipts },
  vendors: { title: '업체 관리', render: vendors },
  items: { title: '품목 관리', render: items },
  inventory: { title: '재고 관리', render: inventory }
};

function won(value) { return `${money.format(value)}원`; }
function badge(status) { return `<span class="badge ${status === '확정' ? 'success' : 'warning'}">${status}</span>`; }
function card(label, value, change, tone = '') { return `<article class="metric-card"><p>${label}</p><strong>${value}</strong><small class="${tone}">${change}</small></article>`; }

function dashboard() {
  const lowStock = state.inventory.filter(i => i.stock <= i.minimum);
  return `<section class="metrics">
    ${card('이번 달 발주금액', '₩4,630,200', '지난달 대비 8.4% ↓', 'good')}
    ${card('발주 업체', '12곳', '지난달과 동일')}
    ${card('관리 품목', '148개', '이번 달 6개 추가')}
    ${card('확인 필요 영수증', '3건', '지금 확인하기', 'attention')}
  </section>
  <section class="grid two-columns">
    <article class="panel spend-panel"><div class="panel-heading"><div><p class="eyebrow">지출 현황</p><h2>월간 발주 추이</h2></div><button class="text-button">이번 달⌄</button></div><div class="chart"><div class="chart-scale"><span>5M</span><span>2.5M</span><span>0</span></div><div class="bars">${[45, 58, 48, 70, 62, 78, 68, 88].map((h, i) => `<div class="bar-wrap"><div class="bar ${i === 7 ? 'current' : ''}" style="height:${h}%"><span>${i === 7 ? '4.6M' : ''}</span></div><small>${i + 1}월</small></div>`).join('')}</div></div></article>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">재고 알림</p><h2>확인이 필요한 품목</h2></div><button class="text-button" data-go="inventory">전체 보기</button></div><div class="alert-list">${lowStock.map(i => `<div class="alert-row"><span class="alert-icon">!</span><div><strong>${i.name} 재고 부족 예상</strong><p>현재 ${i.stock}${i.unit} · 최소 기준 ${i.minimum}${i.unit}</p></div><button class="secondary-button" data-usage="${i.name}">사용량 기록</button></div>`).join('')}</div></article>
  </section>
  <section class="grid two-columns bottom-grid"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">최근 영수증</p><h2>검토 대기</h2></div><button class="text-button" data-go="receipts">전체 보기</button></div>${receiptTable(state.receipts.filter(r => r.status !== '확정').concat(state.receipts.slice(1, 2)))}</article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">비용 인사이트</p><h2>단가 변동</h2></div></div><div class="insight"><span class="trend up">↑ 12%</span><div><strong>한우 등심 단가가 올랐어요</strong><p>지난 3개월 평균보다 12% 높은 가격입니다.</p></div></div><div class="insight"><span class="trend down">↓ 8%</span><div><strong>양파 단가가 안정화됐어요</strong><p>지난 발주 대비 kg당 280원 낮아졌습니다.</p></div></div></article></section>`;
}

function receiptTable(data) { return `<div class="table-wrap"><table><thead><tr><th>업체</th><th>발주일</th><th>품목</th><th>금액</th><th>상태</th></tr></thead><tbody>${data.map(r => `<tr><td><strong>${r.vendor}</strong></td><td>${r.date}</td><td>${r.lines}개</td><td>${won(r.total)}</td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table></div>`; }
function receipts() { const pending = state.receipts.find(r => r.status === '검토 필요'); return `<section class="page-toolbar"><div class="search">⌕ <input placeholder="업체명 또는 품목명 검색" /></div><button class="secondary-button">기간: 이번 달⌄</button></section>${pending ? `<article class="review-card"><div><span class="badge warning">검토 대기</span><h2>${pending.vendor} 영수증을 확인해 주세요</h2><p>${pending.date} · ${pending.lines || 'OCR'}개 품목 · 인식된 총액 ${won(pending.total)}</p></div><button class="primary-button" data-confirm="${pending.id}">검토 완료 및 확정</button></article>` : ''}<article class="panel"><div class="panel-heading"><div><p class="eyebrow">전체 ${state.receipts.length}건</p><h2>발주 영수증</h2></div><button class="primary-button" id="upload-button-inline">＋ 영수증 등록</button></div>${receiptTable(state.receipts)}</article>`; }
function vendors() { const vendorData = [{name:'푸른식자재',total:'₩1,840,000',orders:'24건',tag:'주방',items:['양파 20kg','대파 10kg','감자 15kg']},{name:'한성정육',total:'₩1,250,000',orders:'12건',tag:'주방',items:['한우 등심 5kg','삼겹살 10kg']},{name:'그린패키지',total:'₩698,200',orders:'9건',tag:'홀',items:['포장용기 500개','냅킨 20박스','쇼핑백 300장']}]; return `<section class="vendor-summary"><div><p class="eyebrow">업체별 발주</p><h2>누구에게, 무엇을 주문했나요?</h2><p class="muted">업체를 선택하면 주문 품목과 단가 이력을 확인할 수 있습니다.</p></div><button class="secondary-button">＋ 업체 추가</button></section><section class="vendor-grid">${vendorData.map(v=>`<article class="vendor-card"><div class="vendor-card-top"><div><span class="zone-label ${v.tag === '홀' ? 'hall' : 'kitchen'}">${v.tag}</span><h2>${v.name}</h2></div><strong>${v.total}</strong></div><div class="vendor-meta"><span>이번 달 ${v.orders} 발주</span><span>최근 발주 8월 8일</span></div><div class="vendor-items"><p>최근 주문 품목</p>${v.items.map(item=>`<span>${item}</span>`).join('')}</div><button class="text-button">주문 내역 보기 →</button></article>`).join('')}</section>`; }
function items() { const data = { kitchen:[['양파','채소','16kg','₩1,520/kg','푸른식자재','정상'],['한우 등심','육류','7kg','₩47,000/kg','한성정육','단가 상승'],['식용유','소스·유지','22L','₩2,850/L','그린패키지','정상']], hall:[['포장용기','소모품','420개','₩180/개','그린패키지','정상'],['냅킨','소모품','6박스','₩14,000/박스','그린패키지','재주문 필요'],['쇼핑백','포장재','180장','₩320/장','그린패키지','정상']] }; const title = activeZone === 'kitchen' ? '주방 발주 품목' : '홀 운영 품목'; return `<section class="zone-header"><div><p class="eyebrow">품목 관리</p><h2>${title}</h2><p class="muted">${activeZone === 'kitchen' ? '식자재 재고와 조리용 발주를 관리합니다.' : '포장·서빙·고객 응대 소모품을 관리합니다.'}</p></div><div class="zone-switcher" role="tablist"><button class="${activeZone === 'kitchen' ? 'selected' : ''}" data-zone="kitchen">주방</button><button class="${activeZone === 'hall' ? 'selected' : ''}" data-zone="hall">홀</button></div></section><section class="metrics zone-metrics">${card('이번 달 발주금액',activeZone === 'kitchen' ? '₩3,458,000' : '₩1,172,200','지난달 대비 5.2% ↓','good')}${card('관리 품목',activeZone === 'kitchen' ? '86개' : '62개',activeZone === 'kitchen' ? '부족 재고 2개' : '재주문 필요 1개','attention')}${card('주요 업체',activeZone === 'kitchen' ? '8곳' : '4곳','최근 발주 기준')}</section><article class="panel"><div class="panel-heading"><div><p class="eyebrow">${activeZone === 'kitchen' ? '식자재' : '홀 소모품'} 목록</p><h2>${title} 현황</h2></div><button class="primary-button">＋ 품목 추가</button></div><div class="table-wrap"><table><thead><tr><th>품목</th><th>분류</th><th>현재고</th><th>최근 단가</th><th>주문 업체</th><th>상태</th></tr></thead><tbody>${data[activeZone].map(i=>`<tr><td><strong>${i[0]}</strong></td><td>${i[1]}</td><td>${i[2]}</td><td>${i[3]}</td><td>${i[4]}</td><td>${i[5] === '정상' ? '<span class="badge success">정상</span>' : '<span class="badge warning">'+i[5]+'</span>'}</td></tr>`).join('')}</tbody></table></div></article>`; }
function inventory() { return `<section class="page-toolbar"><div><p class="eyebrow">실시간 재고</p><h2>입고와 사용량을 기록하세요</h2></div><button class="primary-button" id="usage-button">＋ 사용량 기록</button></section><article class="panel"><div class="table-wrap"><table><thead><tr><th>품목</th><th>현재 재고</th><th>최소 기준</th><th>일평균 사용량</th><th>예상 소진</th><th></th></tr></thead><tbody>${state.inventory.map(i => { const days=Math.floor(i.stock/i.usage); return `<tr><td><strong>${i.name}</strong><br><small>${i.category}</small></td><td class="${i.stock<=i.minimum?'attention':''}">${i.stock}${i.unit}</td><td>${i.minimum}${i.unit}</td><td>${i.usage}${i.unit}</td><td>${days}일 후</td><td><button class="secondary-button" data-usage="${i.name}">기록</button></td></tr>`;}).join('')}</tbody></table></div></article>`; }

function render(page = 'dashboard') { document.getElementById('page-title').textContent = pages[page].title; document.getElementById('page-content').innerHTML = pages[page].render(); document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page)); bindPageActions(); }
function bindPageActions() { document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => render(b.dataset.go)); document.querySelectorAll('[data-zone]').forEach(b => b.onclick = () => { activeZone = b.dataset.zone; render('items'); }); document.querySelectorAll('[data-usage]').forEach(b => b.onclick = () => recordUsage(b.dataset.usage)); document.querySelectorAll('[data-confirm]').forEach(b => b.onclick = () => confirmReceipt(Number(b.dataset.confirm))); document.getElementById('upload-button-inline')?.addEventListener('click', openUpload); document.getElementById('usage-button')?.addEventListener('click', () => recordUsage('양파')); }
function openUpload() { document.getElementById('receipt-dialog').showModal(); }
function recordUsage(name) { const item = state.inventory.find(i => i.name === name); const raw = window.prompt(`${name}의 사용량을 입력하세요 (${item.unit})`, '1'); const amount = Number(raw); if (!Number.isFinite(amount) || amount <= 0) return; item.stock = Math.max(0, item.stock - amount); persist(); render(document.querySelector('.nav-item.active').dataset.page); }
function confirmReceipt(id) { const receipt = state.receipts.find(r => r.id === id); if (!receipt) return; receipt.status = '확정'; persist(); render('receipts'); }
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => render(button.dataset.page)));
document.getElementById('upload-button').addEventListener('click', openUpload);
document.getElementById('receipt-file').addEventListener('change', event => document.getElementById('start-ocr').disabled = !event.target.files.length);
document.getElementById('start-ocr').addEventListener('click', event => { const file = document.getElementById('receipt-file').files[0]; if (!file) return; event.preventDefault(); if (window.addReceiptFromUpload) { window.addReceiptFromUpload(file); return; } state.receipts.unshift({ id: Date.now(), vendor: 'OCR 분석 중', date: new Date().toLocaleDateString('ko-KR').replace(/ /g, ''), total: 0, status: '검토 필요', lines: 5 }); persist(); document.getElementById('receipt-dialog').close(); render('receipts'); });
render();
