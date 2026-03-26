// =============================================
// NHÀ TRỌ MANAGER — app.js
// =============================================

// ---------- DATA STORE ----------
const DB = {
  key: 'nhatroData',
  load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || this.default(); }
    catch { return this.default(); }
  },
  save(data) { localStorage.setItem(this.key, JSON.stringify(data)); },
  default() {
    return {
      settings: { defaultElectricPrice: 3500, defaultWaterPrice: 15000, ownerName: '', ownerEmail: '' },
      rooms: [],
      readings: []
    };
  }
};

let state = DB.load();
let editingRoomId = null;

// ---------- HELPERS ----------
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function fmt(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('en-US') + ' đ';
}

function fmtNum(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('en-US');
}

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return `Tháng ${parseInt(mo)}/${y}`;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

function getRoomElectricPrice(room) {
  return room.electricPrice || state.settings.defaultElectricPrice || 3500;
}

function getRoomWaterPrice(room) {
  return room.waterPrice || state.settings.defaultWaterPrice || 15000;
}

function getOtherFeesTotal(room) {
  if (!room.otherFees || !room.otherFees.length) return 0;
  return room.otherFees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
}

// Tính dư nợ kỳ trước: tháng trước chưa đóng thì cộng vào tổng tháng này
function getPrevDebt(room, currentMonth) {
  const prevM  = prevMonthStr(currentMonth);
  const prevRd = getReadingForRoom(room.id, prevM);
  if (!prevRd || prevRd.paid) return 0;
  // Gọi calcBill không đệ quy (chỉ tính bill tháng trước, không kèm dư nợ)
  const b = calcBillBase(room, prevRd);
  return b.total;
}

// calcBillBase: tính bill thuần (không cộng dư nợ kỳ trước)
function calcBillBase(room, reading) {
  const eUsed = Math.max(0, (reading.electricEnd || 0) - (reading.electricStart || 0));
  const eFee  = eUsed * getRoomElectricPrice(room);
  let wUsed, wFee;
  if (room.waterBillingType === 'monthly') {
    wUsed = null;
    wFee  = room.waterMonthlyPrice || 0;
  } else {
    wUsed = Math.max(0, (reading.waterEnd || 0) - (reading.waterStart || 0));
    wFee  = wUsed * getRoomWaterPrice(room);
  }
  const rent  = room.rentPrice || 0;
  const other = getOtherFeesTotal(room);
  const total = rent + eFee + wFee + other;
  return { eUsed, wUsed, eFee, wFee, rent, other, total };
}

function calcBill(room, reading, month) {
  const base     = calcBillBase(room, reading);
  const prevDebt = month ? getPrevDebt(room, month) : 0;
  const grandTotal = base.total + prevDebt;
  return { ...base, prevDebt, grandTotal };
}

function getReadingForRoom(roomId, month) {
  return state.readings.find(r => r.roomId === roomId && r.month === month);
}

// ---------- SETTINGS ----------
function loadSettingsUI() {
  document.getElementById('defaultElectricPrice').value = state.settings.defaultElectricPrice || '';
  document.getElementById('defaultWaterPrice').value    = state.settings.defaultWaterPrice    || '';
  document.getElementById('ownerName').value            = state.settings.ownerName            || '';
  document.getElementById('ownerEmail').value           = state.settings.ownerEmail           || '';
}

document.getElementById('btnSaveSettings').addEventListener('click', () => {
  state.settings.defaultElectricPrice = Number(document.getElementById('defaultElectricPrice').value) || 3500;
  state.settings.defaultWaterPrice    = Number(document.getElementById('defaultWaterPrice').value)    || 15000;
  state.settings.ownerName            = document.getElementById('ownerName').value.trim();
  state.settings.ownerEmail           = document.getElementById('ownerEmail').value.trim();
  DB.save(state);
  showToast('Đã lưu cài đặt', 'success');
});

// ---------- ROOMS TAB ----------
function renderRooms() {
  const tbody = document.getElementById('roomsBody');
  const empty = document.getElementById('roomsEmpty');
  const tbl   = document.getElementById('roomsTable');

  if (!state.rooms.length) {
    tbody.innerHTML = '';
    tbl.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  tbl.style.display = '';
  empty.style.display = 'none';

  tbody.innerHTML = state.rooms.map(r => {
    const waterCell = r.waterBillingType === 'monthly'
      ? `<span class="badge badge-warning" style="font-size:0.75rem">📅 Cố định: ${fmt(r.waterMonthlyPrice)}/tháng</span>`
      : (r.waterPrice ? fmt(r.waterPrice) + '/m³' : '<span style="color:var(--text3)">Theo số (mặc định)</span>');
    return `
    <tr>
      <td><strong>${r.name}</strong></td>
      <td>${r.tenant || '<span style="color:var(--text3)">Chưa có</span>'}</td>
      <td>${r.phone  || '—'}</td>
      <td>${fmt(r.rentPrice)}</td>
      <td>${r.electricPrice ? fmt(r.electricPrice) + '/kWh' : '<span style="color:var(--text3)">Mặc định</span>'}</td>
      <td>${waterCell}</td>
      <td>${r.otherFees && r.otherFees.length
            ? r.otherFees.map(f => `${f.name}: ${fmt(f.amount)}`).join(', ')
            : '—'}</td>
      <td>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn-outline btn-sm" onclick="openEditRoom('${r.id}')">
            <i class="fa-solid fa-pen"></i> Sửa
          </button>
          <button class="btn-danger-sm" onclick="deleteRoom('${r.id}')">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

// ---------- ROOM MODAL ----------
function toggleWaterMonthly() {
  const type = document.getElementById('roomWaterBillingType').value;
  document.getElementById('waterUsageGroup').style.display  = type === 'usage'   ? '' : 'none';
  document.getElementById('waterMonthlyGroup').style.display = type === 'monthly' ? '' : 'none';
}

function openAddRoom() {
  editingRoomId = null;
  document.getElementById('modalRoomTitle').textContent = 'Thêm Phòng Mới';
  document.getElementById('roomName').value = '';
  document.getElementById('roomTenant').value = '';
  document.getElementById('roomPhone').value = '';
  document.getElementById('roomRentPrice').value = '';
  document.getElementById('roomElectricPrice').value = '';
  document.getElementById('roomWaterBillingType').value = 'usage';
  document.getElementById('roomWaterPrice').value = '';
  document.getElementById('roomWaterMonthlyPrice').value = '';
  toggleWaterMonthly();
  renderOtherFeesEditor([]);
  document.getElementById('modalRoom').style.display = 'flex';
  document.getElementById('roomName').focus();
}

function openEditRoom(id) {
  const room = state.rooms.find(r => r.id === id);
  if (!room) return;
  editingRoomId = id;
  document.getElementById('modalRoomTitle').textContent = 'Sửa Thông Tin Phòng';
  document.getElementById('roomName').value              = room.name || '';
  document.getElementById('roomTenant').value            = room.tenant || '';
  document.getElementById('roomPhone').value             = room.phone || '';
  document.getElementById('roomRentPrice').value         = room.rentPrice || '';
  document.getElementById('roomElectricPrice').value     = room.electricPrice || '';
  document.getElementById('roomWaterBillingType').value  = room.waterBillingType || 'usage';
  document.getElementById('roomWaterPrice').value        = room.waterPrice || '';
  document.getElementById('roomWaterMonthlyPrice').value = room.waterMonthlyPrice || '';
  toggleWaterMonthly();
  renderOtherFeesEditor(room.otherFees || []);
  document.getElementById('modalRoom').style.display = 'flex';
}

function closeRoomModal() {
  document.getElementById('modalRoom').style.display = 'none';
}

function renderOtherFeesEditor(fees) {
  const c = document.getElementById('otherFeesContainer');
  c.innerHTML = '';
  fees.forEach((f, i) => addFeeRow(f.name, f.amount));
}

function addFeeRow(name = '', amount = '') {
  const c = document.getElementById('otherFeesContainer');
  const div = document.createElement('div');
  div.className = 'fee-row';
  div.innerHTML = `
    <input type="text" placeholder="Tên phụ phí (VD: Rác, Xe, Internet)" value="${name}" class="fee-name"/>
    <input type="number" placeholder="Số tiền" value="${amount}" class="fee-amount" style="width:130px"/>
    <button class="btn-danger-sm" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  c.appendChild(div);
}

document.getElementById('btnAddRoom').addEventListener('click', openAddRoom);
document.getElementById('btnAddFee').addEventListener('click', () => addFeeRow());
document.getElementById('btnCloseRoomModal').addEventListener('click', closeRoomModal);
document.getElementById('btnCancelRoomModal').addEventListener('click', closeRoomModal);

document.getElementById('btnSaveRoom').addEventListener('click', () => {
  const name = document.getElementById('roomName').value.trim();
  if (!name) { showToast('Vui lòng nhập tên phòng', 'error'); return; }

  const feeRows = document.querySelectorAll('#otherFeesContainer .fee-row');
  const otherFees = [];
  feeRows.forEach(row => {
    const n = row.querySelector('.fee-name').value.trim();
    const a = Number(row.querySelector('.fee-amount').value) || 0;
    if (n) otherFees.push({ name: n, amount: a });
  });

  const waterBillingType   = document.getElementById('roomWaterBillingType').value;
  const data = {
    name,
    tenant:           document.getElementById('roomTenant').value.trim(),
    phone:            document.getElementById('roomPhone').value.trim(),
    rentPrice:        Number(document.getElementById('roomRentPrice').value) || 0,
    electricPrice:    Number(document.getElementById('roomElectricPrice').value) || 0,
    waterBillingType,
    waterPrice:       waterBillingType === 'usage'   ? (Number(document.getElementById('roomWaterPrice').value) || 0) : 0,
    waterMonthlyPrice:waterBillingType === 'monthly' ? (Number(document.getElementById('roomWaterMonthlyPrice').value) || 0) : 0,
    otherFees
  };

  if (editingRoomId) {
    const idx = state.rooms.findIndex(r => r.id === editingRoomId);
    if (idx !== -1) state.rooms[idx] = { ...state.rooms[idx], ...data };
    showToast('Đã cập nhật phòng', 'success');
  } else {
    state.rooms.push({ id: uid(), ...data });
    showToast('Đã thêm phòng mới', 'success');
  }

  DB.save(state);
  closeRoomModal();
  renderRooms();
});

function deleteRoom(id) {
  if (!confirm('Xóa phòng này? Dữ liệu chỉ số của phòng cũng sẽ bị xóa.')) return;
  state.rooms    = state.rooms.filter(r => r.id !== id);
  state.readings = state.readings.filter(r => r.roomId !== id);
  DB.save(state);
  renderRooms();
  showToast('Đã xóa phòng', 'success');
}

// ---------- READINGS TAB ----------
const readingMonthEl = document.getElementById('readingMonth');
readingMonthEl.value = currentMonth();
readingMonthEl.addEventListener('change', renderReadings);

function renderReadings() {
  const month = readingMonthEl.value || currentMonth();
  const tbody = document.getElementById('readingsBody');
  const empty = document.getElementById('readingsEmpty');
  const tbl   = document.getElementById('readingsTable');

  if (!state.rooms.length) {
    tbody.innerHTML = '';
    tbl.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  tbl.style.display = '';
  empty.style.display = 'none';

  const prevMonth = prevMonthStr(month);
  tbody.innerHTML = state.rooms.map(room => {
    const rd     = getReadingForRoom(room.id, month) || {};
    const prevRd = getReadingForRoom(room.id, prevMonth);
    // Tự điền chỉ số đầu kỳ = chỉ số cuối kỳ tháng trước
    const eStartVal = rd.electricStart ?? (prevRd?.electricEnd ?? '');
    const eUsed = rd.electricStart != null
      ? Math.max(0, (rd.electricEnd || 0) - (rd.electricStart || 0)) + ' kWh'
      : '—';
    const isMonthlyWater = room.waterBillingType === 'monthly';
    const wS = rd.waterStart ?? (prevRd?.waterEnd ?? '');
    const waterCells = isMonthlyWater
      ? `<td colspan="3" style="text-align:center">
           <span class="badge badge-warning" style="font-size:0.8rem">
             📅 Cố định: ${fmt(room.waterMonthlyPrice)}/tháng
           </span>
         </td>`
      : `<td><input type="number" class="rd-wStart" data-room="${room.id}" value="${wS}" placeholder="0" onchange="updateCalc(this)"/></td>
         <td><input type="number" class="rd-wEnd"   data-room="${room.id}" value="${rd.waterEnd ?? ''}" placeholder="0" onchange="updateCalc(this)"/></td>
         <td><span class="calc-cell" id="wu-${room.id}">${rd.waterStart != null ? Math.max(0,(rd.waterEnd||0)-(rd.waterStart||0)) + ' m³' : '—'}</span></td>`;
    return `
    <tr>
      <td><strong>${room.name}</strong></td>
      <td>${room.tenant || '—'}</td>
      <td><input type="number" class="rd-eStart" data-room="${room.id}" value="${eStartVal}" placeholder="0" onchange="updateCalc(this)"
        ${!rd.electricStart && prevRd?.electricEnd ? `title="Tự điền từ táng trước: ${prevRd.electricEnd}"` : ''}/></td>
      <td><input type="number" class="rd-eEnd"   data-room="${room.id}" value="${rd.electricEnd ?? ''}" placeholder="0" onchange="updateCalc(this)"/></td>
      <td><span class="calc-cell" id="eu-${room.id}">${eUsed}</span></td>
      ${waterCells}
      <td><input type="text" class="rd-note" data-room="${room.id}" value="${rd.note || ''}" placeholder="Ghi chú"/></td>
      <td>
        <button class="btn-primary btn-sm" onclick="saveReading('${room.id}')">
          <i class="fa-solid fa-save"></i> Lưu
        </button>
      </td>
    </tr>`;
  }).join('');
}

function updateCalc(el) {
  const roomId = el.dataset.room;
  const row    = el.closest('tr');
  const eStart = Number(row.querySelector('.rd-eStart').value) || 0;
  const eEnd   = Number(row.querySelector('.rd-eEnd').value)   || 0;
  const euEl   = document.getElementById('eu-' + roomId);
  if (euEl) euEl.textContent = Math.max(0, eEnd - eStart) + ' kWh';
  // Nước theo số đo thì cập nhật, cố định tháng thì bỏ qua
  const wStartEl = row.querySelector('.rd-wStart');
  const wEndEl   = row.querySelector('.rd-wEnd');
  const wuEl     = document.getElementById('wu-' + roomId);
  if (wStartEl && wEndEl && wuEl) {
    const wStart = Number(wStartEl.value) || 0;
    const wEnd   = Number(wEndEl.value)   || 0;
    wuEl.textContent = Math.max(0, wEnd - wStart) + ' m³';
  }
}

function saveReading(roomId) {
  const month  = readingMonthEl.value || currentMonth();
  const room   = state.rooms.find(r => r.id === roomId);
  const row    = document.querySelector(`input.rd-eStart[data-room="${roomId}"]`).closest('tr');

  const eStart = Number(row.querySelector('.rd-eStart').value) || 0;
  const eEnd   = Number(row.querySelector('.rd-eEnd').value)   || 0;
  const note   = row.querySelector('.rd-note').value.trim();

  // Nước cố định tháng: không cần lưu chỉ số
  const isMonthlyWater = room && room.waterBillingType === 'monthly';
  const wStart = isMonthlyWater ? 0 : (Number(row.querySelector('.rd-wStart')?.value) || 0);
  const wEnd   = isMonthlyWater ? 0 : (Number(row.querySelector('.rd-wEnd')?.value)   || 0);

  const existing = state.readings.findIndex(r => r.roomId === roomId && r.month === month);
  const data = { roomId, month, electricStart: eStart, electricEnd: eEnd,
                 waterStart: wStart, waterEnd: wEnd, note, paid: false, paidDate: null };

  if (existing !== -1) {
    data.paid     = state.readings[existing].paid;
    data.paidDate = state.readings[existing].paidDate;
    state.readings[existing] = { ...state.readings[existing], ...data };
  } else {
    state.readings.push({ id: uid(), ...data });
  }

  DB.save(state);
  showToast(`Đã lưu: ${row.querySelector('td:first-child').textContent.trim()}`, 'success');
  updateCalc(row.querySelector('.rd-eStart'));
}

// ---------- BILLING TAB ----------
const billingMonthEl = document.getElementById('billingMonth');
billingMonthEl.value = currentMonth();
billingMonthEl.addEventListener('change', renderBilling);

function renderBilling() {
  const month  = billingMonthEl.value || currentMonth();
  const tbody  = document.getElementById('billingBody');
  const empty  = document.getElementById('billingEmpty');
  const tbl    = document.getElementById('billingTable');
  const stats  = document.getElementById('billingStats');

  const rows = state.rooms.map(room => {
    const rd = getReadingForRoom(room.id, month);
    return { room, rd, bill: rd ? calcBill(room, rd, month) : null };
  });

  const withData = rows.filter(r => r.rd);
  if (!withData.length) {
    tbody.innerHTML = '';
    tbl.style.display = 'none';
    empty.style.display = 'block';
    stats.innerHTML = '';
    return;
  }
  tbl.style.display = '';
  empty.style.display = 'none';

  const totalAll   = withData.reduce((s, r) => s + r.bill.grandTotal, 0);
  const totalPaid  = withData.filter(r => r.rd.paid).reduce((s, r) => s + r.bill.grandTotal, 0);
  const totalDebt  = totalAll - totalPaid;
  const countPaid  = withData.filter(r => r.rd.paid).length;

  stats.innerHTML = `
    <div class="stat-card blue">
      <div class="stat-icon"><i class="fa-solid fa-building"></i></div>
      <div class="stat-label">Tổng số phòng</div>
      <div class="stat-value">${withData.length}</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-icon"><i class="fa-solid fa-money-bill-wave"></i></div>
      <div class="stat-label">Tổng phải thu</div>
      <div class="stat-value">${totalAll.toLocaleString('en-US')}<small style="font-size:0.9rem"> đ</small></div>
    </div>
    <div class="stat-card green">
      <div class="stat-icon"><i class="fa-solid fa-check-circle"></i></div>
      <div class="stat-label">Đã thu (${countPaid} phòng)</div>
      <div class="stat-value">${totalPaid.toLocaleString('en-US')}<small style="font-size:0.9rem"> đ</small></div>
    </div>
    <div class="stat-card red">
      <div class="stat-icon"><i class="fa-solid fa-clock"></i></div>
      <div class="stat-label">Còn nợ</div>
      <div class="stat-value">${totalDebt.toLocaleString('en-US')}<small style="font-size:0.9rem"> đ</small></div>
    </div>
  `;

  tbody.innerHTML = rows.map(({ room, rd, bill }) => {
    if (!rd) return `<tr><td><strong>${room.name}</strong></td><td>${room.tenant || '—'}</td><td colspan="7" style="color:var(--text3);font-style:italic">Chưa nhập chỉ số tháng này</td></tr>`;
    const paidClass = rd.paid ? 'badge-success' : 'badge-warning';
    const paidLabel = rd.paid ? `<i class="fa-solid fa-check"></i> Đã thu` : `<i class="fa-solid fa-clock"></i> Chưa thu`;
    return `
    <tr>
      <td><strong>${room.name}</strong></td>
      <td>${room.tenant || '—'}</td>
      <td>${fmt(bill.rent)}</td>
      <td>${fmt(bill.eFee)} <small style="color:var(--text3)">(${fmtNum(bill.eUsed)} kWh)</small></td>
      <td>${fmt(bill.wFee)} <small style="color:var(--text3)">${room.waterBillingType==='monthly' ? '📅 cố định/tháng' : '('+fmtNum(bill.wUsed)+' m³)'}</small></td>
      <td>${bill.other ? fmt(bill.other) : '—'}</td>
      <td>${bill.prevDebt > 0 ? `<span style="color:var(--danger)">${fmt(bill.prevDebt)}</span>` : '—'}</td>
      <td><strong style="color:var(--accent2)">${fmt(bill.grandTotal)}</strong></td>
      <td><span class="badge ${paidClass}">${paidLabel}</span></td>
      <td>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          ${rd.paid
            ? `<button class="btn-danger-sm btn-sm" onclick="markPaid('${room.id}','${month}',false)"><i class="fa-solid fa-rotate-left"></i> Hoàn</button>`
            : `<button class="btn-primary btn-sm btn-success" onclick="markPaid('${room.id}','${month}',true)"><i class="fa-solid fa-check"></i> Thu tiền</button>`
          }
          <button class="btn-print btn-sm" onclick="openPrintModal('${room.id}','${month}')">
            <i class="fa-solid fa-print"></i> In
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function markPaid(roomId, month, paid) {
  const idx = state.readings.findIndex(r => r.roomId === roomId && r.month === month);
  if (idx === -1) return;
  state.readings[idx].paid     = paid;
  state.readings[idx].paidDate = paid ? new Date().toISOString().split('T')[0] : null;
  DB.save(state);
  renderBilling();
  renderReport();
  updateAlertBadge();
  showToast(paid ? 'Đã đánh dấu thu tiền' : 'Đã hủy đánh dấu', paid ? 'success' : '');
}

// ---------- REPORT TAB ----------
const reportMonthEl = document.getElementById('reportMonth');
reportMonthEl.value = currentMonth();
reportMonthEl.addEventListener('change', renderReport);

function renderReport() {
  const month = reportMonthEl.value || currentMonth();
  const tbody = document.getElementById('reportBody');
  const empty = document.getElementById('reportEmpty');
  const tbl   = document.getElementById('reportTable');
  const stats = document.getElementById('reportStats');

  const rows = state.rooms.map(room => {
    const rd   = getReadingForRoom(room.id, month);
    const bill = rd ? calcBill(room, rd) : null;
    return { room, rd, bill };
  }).filter(r => r.rd);

  if (!rows.length) {
    tbody.innerHTML = '';
    tbl.style.display = 'none';
    empty.style.display = 'block';
    stats.innerHTML = '';
    return;
  }
  tbl.style.display = '';
  empty.style.display = 'none';

  const totalAll  = rows.reduce((s, r) => s + r.bill.total, 0);
  const totalPaid = rows.filter(r => r.rd.paid).reduce((s, r) => s + r.bill.total, 0);
  const totalDebt = totalAll - totalPaid;
  const countPaid = rows.filter(r => r.rd.paid).length;
  const eTotal    = rows.reduce((s, r) => s + (r.bill.eUsed || 0), 0);
  // Chỉ tính tổng nước m³ cho phòng tính theo số đo
  const wTotal    = rows.filter(r => r.room.waterBillingType !== 'monthly').reduce((s, r) => s + (r.bill.wUsed || 0), 0);

  stats.innerHTML = `
    <div class="stat-card blue">
      <div class="stat-icon"><i class="fa-solid fa-building"></i></div>
      <div class="stat-label">Phòng có dữ liệu</div>
      <div class="stat-value">${rows.length}</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-icon"><i class="fa-solid fa-coins"></i></div>
      <div class="stat-label">Tổng phải thu</div>
      <div class="stat-value">${totalAll.toLocaleString('en-US')}<small style="font-size:.85rem"> đ</small></div>
    </div>
    <div class="stat-card green">
      <div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div>
      <div class="stat-label">Đã thu (${countPaid}/${rows.length})</div>
      <div class="stat-value">${totalPaid.toLocaleString('en-US')}<small style="font-size:.85rem"> đ</small></div>
    </div>
    <div class="stat-card red">
      <div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div>
      <div class="stat-label">Còn nợ (${rows.length - countPaid} phòng)</div>
      <div class="stat-value">${totalDebt.toLocaleString('en-US')}<small style="font-size:.85rem"> đ</small></div>
    </div>
    <div class="stat-card yellow">
      <div class="stat-icon"><i class="fa-solid fa-bolt"></i></div>
      <div class="stat-label">Tổng điện tiêu thụ</div>
      <div class="stat-value">${fmtNum(eTotal)}<small style="font-size:.85rem"> kWh</small></div>
    </div>
    <div class="stat-card yellow">
      <div class="stat-icon"><i class="fa-solid fa-droplet"></i></div>
      <div class="stat-label">Tổng nước tiêu thụ</div>
      <div class="stat-value">${fmtNum(wTotal)}<small style="font-size:.85rem"> m³</small></div>
    </div>
  `;

  tbody.innerHTML = rows.map(({ room, rd, bill }) => {
    const paidClass = rd.paid ? 'badge-success' : 'badge-warning';
    const paidLabel = rd.paid
      ? `<i class="fa-solid fa-check"></i> Đã thu`
      : `<i class="fa-solid fa-clock"></i> Chưa thu`;
    return `
    <tr>
      <td><strong>${room.name}</strong></td>
      <td>${room.tenant || '—'}</td>
      <td>${fmt(bill.rent)}</td>
      <td>${fmt(bill.eFee)}</td>
      <td>${fmt(bill.wFee)} <small style="color:var(--text3)">${room.waterBillingType==='monthly' ? '📅' : (bill.wUsed != null ? fmtNum(bill.wUsed)+' m³' : '')}</small></td>
      <td>${bill.other ? fmt(bill.other) : '—'}</td>
      <td><strong style="color:var(--accent2)">${fmt(bill.total)}</strong></td>
      <td><span class="badge ${paidClass}">${paidLabel}</span></td>
      <td>${rd.paidDate || '—'}</td>
      <td>
        <button class="btn-print btn-sm" onclick="openPrintModal('${room.id}','${month}')">
          <i class="fa-solid fa-print"></i> In phiếu
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ---------- PRINT INVOICE ----------
function openPrintModal(roomId, month) {
  const room = state.rooms.find(r => r.id === roomId);
  const rd   = getReadingForRoom(roomId, month);
  if (!room || !rd) return;

  const bill   = calcBill(room, rd);
  const [y, mo] = month.split('-').map(Number);
  const moStr  = String(mo).padStart(2,'0');
  const daysInMonth = new Date(y, mo, 0).getDate();
  const periodVI = `01/${moStr}/${y} - ${daysInMonth}/${moStr}/${y}`;
  const monthVI  = `Tháng ${moStr} ${y}`;
  const monthEN  = new Date(y, mo-1, 1).toLocaleString('en-US',{month:'short'}) + ' ' + y;
  const now      = new Date();
  const issueVI  = `${now.getDate()}/${mo}/${y}`;
  const issueEN  = now.toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric'});
  const dueDay   = `28/${moStr}/${y}`;
  const owner    = state.settings.ownerName || 'Chủ nhà trọ';

  let rows = ''; let n = 0;

  // 1. Tiền phòng
  n++;
  rows += `<tr class="inv-cat"><td class="inv-c">${n}</td>
    <td>Tiền thuê phòng: ${periodVI}</td>
    <td></td><td></td><td class="inv-r">${fmtNum(bill.rent)}</td><td></td></tr>`;

  // 2. Điện
  n++;
  rows += `<tr class="inv-cat"><td class="inv-c">${n}</td>
    <td>Tiền điện: ${periodVI}</td>
    <td></td><td></td><td class="inv-r">${fmtNum(bill.eFee)}</td><td></td></tr>
  <tr class="inv-sub"><td></td><td>Chỉ số đầu kỳ</td>
    <td class="inv-r">${fmtNum(rd.electricStart)}</td><td></td><td></td><td></td></tr>
  <tr class="inv-sub"><td></td><td>Chỉ số cuối kỳ</td>
    <td class="inv-r">${fmtNum(rd.electricEnd)}</td><td></td><td></td><td></td></tr>
  <tr class="inv-sub"><td></td><td>Tiêu thụ</td>
    <td class="inv-r">${fmtNum(bill.eUsed)} kWh</td>
    <td class="inv-r">${fmtNum(getRoomElectricPrice(room))}</td>
    <td class="inv-r">${fmtNum(bill.eFee)}</td><td></td></tr>`;

  // 3. Nước
  n++;
  if (room.waterBillingType === 'monthly') {
    rows += `<tr class="inv-cat"><td class="inv-c">${n}</td>
      <td>Tiền nước — cố định hàng tháng</td>
      <td class="inv-r">1</td><td class="inv-r">${fmtNum(room.waterMonthlyPrice)}</td>
      <td class="inv-r">${fmtNum(bill.wFee)}</td><td></td></tr>`;
  } else {
    rows += `<tr class="inv-cat"><td class="inv-c">${n}</td>
      <td>Tiền nước: ${periodVI}</td>
      <td></td><td></td><td class="inv-r">${fmtNum(bill.wFee)}</td><td></td></tr>
    <tr class="inv-sub"><td></td><td>Chỉ số đầu kỳ</td>
      <td class="inv-r">${fmtNum(rd.waterStart)}</td><td></td><td></td><td></td></tr>
    <tr class="inv-sub"><td></td><td>Chỉ số cuối kỳ</td>
      <td class="inv-r">${fmtNum(rd.waterEnd)}</td><td></td><td></td><td></td></tr>
    <tr class="inv-sub"><td></td><td>Tiêu thụ</td>
      <td class="inv-r">${fmtNum(bill.wUsed)} m³</td>
      <td class="inv-r">${fmtNum(getRoomWaterPrice(room))}</td>
      <td class="inv-r">${fmtNum(bill.wFee)}</td><td></td></tr>`;
  }

  // 4. Dịch vụ khác
  if (room.otherFees && room.otherFees.length) {
    n++;
    rows += `<tr class="inv-cat"><td class="inv-c">${n}</td>
      <td>Dịch vụ khác</td>
      <td></td><td></td><td class="inv-r">${fmtNum(bill.other)}</td><td></td></tr>`;
    room.otherFees.forEach(f => {
      rows += `<tr class="inv-sub"><td></td><td>${f.name}</td>
        <td class="inv-r">1</td><td class="inv-r">${fmtNum(f.amount)}</td>
        <td class="inv-r">${fmtNum(f.amount)}</td><td></td></tr>`;
    });
  }

  if (rd.note) rows += `<tr class="inv-sub"><td></td>
    <td colspan="5">Ghi chú: ${rd.note}</td></tr>`;

  document.getElementById('printArea').innerHTML = `
  <div class="invoice-page">
    <div class="inv-header">
      <div class="inv-title">PHIẾU THÔNG BÁO PHÍ</div>
      <div class="inv-period">${monthVI}</div>
      <div class="inv-date">Ngày phát hành: ${issueVI}</div>
    </div>
    <table class="inv-info"><tbody>
      <tr>
        <td>Kính gửi: <strong>${room.tenant || '—'}</strong></td>
        <td>Phòng: <strong>${room.name}</strong></td>
        <td style="text-align:right">SĐT: <strong>${room.phone || '—'}</strong></td>
      </tr>
    </tbody></table>
    <div class="inv-intro">
      Xin thông báo tới Quý khách về các khoản phí trong ${monthVI} như sau:
    </div>
    <div style="text-align:right;font-size:11px;margin-bottom:3px">Đơn vị tính: đồng (VNĐ)</div>
    <table class="inv-table"><thead>
      <tr>
        <th class="inv-c">TT</th>
        <th style="text-align:left">Hạng mục</th>
        <th class="inv-r">Số lượng</th>
        <th class="inv-r">Đơn giá</th>
        <th class="inv-r">Thành tiền</th>
        <th class="inv-r" style="width:70px">Đã nộp</th>
      </tr>
    </thead><tbody>${rows}</tbody>
    <tfoot>
      <tr class="inv-subtotal">
        <td colspan="4" style="text-align:right">Tổng cộng</td>
        <td class="inv-r">${fmtNum(bill.total)}</td><td></td>
      </tr>
      <tr class="inv-grand">
        <td colspan="4"><strong>Tổng tiền cần thanh toán</strong></td>
        <td class="inv-r"><strong>${fmtNum(bill.total)}</strong></td>
        <td class="inv-r" style="text-align:center">${rd.paid ? '✓' : ''}</td>
      </tr>
    </tfoot>
    </table>
    <div class="inv-footer-note">
      Quý khách vui lòng thanh toán trước ngày <strong>${dueDay}</strong><br>
      <small>${rd.paid ? '✅ Đã thanh toán ngày ' + rd.paidDate : '⏳ Chưa thanh toán'}</small>
    </div>
    <div class="inv-signs">
      <div><div>Chủ nhà</div>
        <div class="inv-sign-line"></div>
        <div style="font-size:11px">${owner}</div></div>
      <div><div>Người thuê</div>
        <div class="inv-sign-line"></div>
        <div style="font-size:11px">${room.tenant || ''}</div></div>
    </div>
  </div>`;

  document.getElementById('modalPrint').style.display = 'flex';
}

document.getElementById('btnClosePrintModal').addEventListener('click', () => {
  document.getElementById('modalPrint').style.display = 'none';
});


// ---------- ALERTS TAB ----------
const alertMonthEl = document.getElementById('alertMonth');
alertMonthEl.value = currentMonth();
alertMonthEl.addEventListener('change', renderAlerts);

function updateAlertBadge() {
  const month = currentMonth();
  const unpaid = state.rooms.filter(room => {
    const rd = getReadingForRoom(room.id, month);
    return rd && !rd.paid;
  }).length;
  const badge = document.getElementById('navAlertBadge');
  badge.textContent = unpaid;
  badge.style.display = unpaid > 0 ? 'inline-block' : 'none';
}

function checkDayBanner() {
  const day   = new Date().getDate();
  const banner = document.getElementById('dayAlertBanner');
  if (day === 20) {
    banner.className = 'alert-banner warning';
    banner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Hôm nay ngày <strong>20</strong> — Nhớ gửi thông báo thu tiền cho khách thuê! Nhấn "Soạn Email Cảnh Báo" bên trên.';
    banner.style.display = 'flex';
  } else if (day === 27) {
    banner.className = 'alert-banner danger';
    banner.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Hôm nay ngày <strong>27</strong> — Đã gần cuối tháng! Có phòng chưa đóng tiền bên dưới, gửi nhắc ngay!';
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function renderAlerts() {
  const month  = alertMonthEl.value || currentMonth();
  const tbody  = document.getElementById('alertsBody');
  const empty  = document.getElementById('alertsEmpty');
  const tbl    = document.getElementById('alertsTable');
  const stats  = document.getElementById('alertStats');

  const unpaidRows = state.rooms.map(room => {
    const rd = getReadingForRoom(room.id, month);
    if (!rd || rd.paid) return null;
    return { room, rd, bill: calcBill(room, rd) };
  }).filter(Boolean);

  const noReadingRooms = state.rooms.filter(room => !getReadingForRoom(room.id, month));

  if (!unpaidRows.length && !noReadingRooms.length) {
    tbody.innerHTML = '';
    tbl.style.display = 'none';
    empty.style.display = 'block';
    stats.innerHTML = `
      <div class="stat-card green">
        <div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div>
        <div class="stat-label">Tất cả đã đóng tiền 🎉</div>
        <div class="stat-value">${state.rooms.length} / ${state.rooms.length}</div>
      </div>`;
    updateAlertBadge();
    return;
  }

  tbl.style.display = '';
  empty.style.display = 'none';
  const totalDebt = unpaidRows.reduce((s, r) => s + r.bill.total, 0);

  stats.innerHTML = `
    <div class="stat-card red">
      <div class="stat-icon"><i class="fa-solid fa-clock"></i></div>
      <div class="stat-label">Phòng chưa đóng tiền</div>
      <div class="stat-value">${unpaidRows.length}</div>
    </div>
    <div class="stat-card red">
      <div class="stat-icon"><i class="fa-solid fa-money-bill"></i></div>
      <div class="stat-label">Tổng tiền còn nợ</div>
      <div class="stat-value">${totalDebt.toLocaleString('en-US')}<small style="font-size:.85rem"> đ</small></div>
    </div>
    <div class="stat-card yellow">
      <div class="stat-icon"><i class="fa-solid fa-circle-question"></i></div>
      <div class="stat-label">Chưa nhập chỉ số</div>
      <div class="stat-value">${noReadingRooms.length}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-icon"><i class="fa-solid fa-check-circle"></i></div>
      <div class="stat-label">Đã thu tiền</div>
      <div class="stat-value">${state.rooms.length - unpaidRows.length - noReadingRooms.length} / ${state.rooms.length - noReadingRooms.length}</div>
    </div>
  `;

  tbody.innerHTML = [
    ...unpaidRows.map(({ room, rd, bill }) => `
    <tr>
      <td><strong>${room.name}</strong></td>
      <td>${room.tenant || '—'}</td>
      <td>${room.phone  || '—'}</td>
      <td><strong style="color:var(--danger);font-size:1rem">${fmt(bill.total)}</strong></td>
      <td>${rd.note || '—'}</td>
      <td>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn-primary btn-sm btn-success"
            onclick="markPaid('${room.id}','${alertMonthEl.value||currentMonth()}',true);renderAlerts()">
            <i class="fa-solid fa-check"></i> Thu
          </button>
          <button class="btn-print btn-sm" onclick="openPrintModal('${room.id}','${alertMonthEl.value||currentMonth()}')">
            <i class="fa-solid fa-print"></i> In phiếu
          </button>
        </div>
      </td>
    </tr>`),
    ...noReadingRooms.map(room => `
    <tr style="opacity:0.6">
      <td><strong>${room.name}</strong></td>
      <td>${room.tenant || '—'}</td>
      <td>${room.phone  || '—'}</td>
      <td><span class="badge badge-warning"><i class="fa-solid fa-question"></i> Chưa nhập chỉ số</span></td>
      <td>—</td>
      <td>—</td>
    </tr>`)
  ].join('');

  updateAlertBadge();
}

function buildAlertMailto() {
  const month = alertMonthEl.value || currentMonth();
  const [y, mo] = month.split('-');
  const monthStr = `Tháng ${parseInt(mo)}/${y}`;
  const ownerEmail = state.settings.ownerEmail || '';

  const unpaidRows = state.rooms.map(room => {
    const rd = getReadingForRoom(room.id, month);
    if (!rd || rd.paid) return null;
    return { room, bill: calcBill(room, rd) };
  }).filter(Boolean);

  if (!unpaidRows.length) {
    showToast('Không có phòng nào còn nợ tháng này!', 'success');
    return;
  }

  const subject = encodeURIComponent(`[NHẮC TIỀN] Thu tiền phòng trọ - ${monthStr}`);
  let body = `Kính gửi quý khách thuê phòng,\n\n`;
  body += `Nhà trọ xin nhắc nhở các phòng sau chưa nộp tiền ${monthStr}:\n\n`;
  unpaidRows.forEach(({ room, bill }) => {
    body += `  📌 ${room.name}`;
    if (room.tenant) body += ` - ${room.tenant}`;
    if (room.phone)  body += ` (${room.phone})`;
    body += `: ${bill.total.toLocaleString('en-US')} đồng\n`;
  });
  body += `\nVui lòng nộp tiền trước ngày cuối tháng.\n`;
  body += `Liên hệ thắc mắc: ${state.settings.ownerName || 'Chủ nhà trọ'}\n\nXin cảm ơn!`;

  const mailto = `mailto:${ownerEmail}?subject=${subject}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
  showToast('Đã mở phần mềm email — kiểm tra và nhấn Gửi!', 'success');
}

document.getElementById('btnSendAlert').addEventListener('click', buildAlertMailto);

// ---------- MONTHLY EXPORT ----------
function exportMonthCSV() {
  const month = alertMonthEl.value || currentMonth();
  const [y, mo] = month.split('-');

  const header = ['Phòng','Người thuê','SĐT','Tiền phòng',
    'Điện đầu kỳ','Điện cuối kỳ','Tiêu thụ (kWh)','Tiền điện',
    'Loại nước','Tiêu thụ (m³)','Tiền nước',
    'Dịch vụ tháng','Ghi chú','Tổng cộng','Trạng thái','Ngày thu'];

  const dataRows = state.rooms.map(room => {
    const rd = getReadingForRoom(room.id, month);
    if (!rd) return [room.name, room.tenant||'', room.phone||'',
      room.rentPrice||0, '','','','',
      room.waterBillingType==='monthly'?'Cố định':'Theo số','','',
      getOtherFeesTotal(room),'', '', 'Chưa nhập chỉ số',''];
    const bill = calcBill(room, rd);
    return [
      room.name, room.tenant||'', room.phone||'', bill.rent,
      rd.electricStart, rd.electricEnd, bill.eUsed, bill.eFee,
      room.waterBillingType==='monthly' ? 'Cố định/tháng' : 'Theo số (m³)',
      bill.wUsed ?? 'N/A', bill.wFee,
      bill.other, rd.note||'', bill.total,
      rd.paid ? 'Đã thu' : 'Chưa thu', rd.paidDate||''
    ];
  });

  const allRows = [header, ...dataRows];
  const csv  = allRows.map(row => row.map(c => `"${c}"`).join(',')).join('\n');
  const bom  = '\uFEFF'; // BOM for Excel Vietnamese
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `nhatro-${month}.csv`;
  a.click();
  showToast(`Đã xuất: nhatro-${month}.csv`, 'success');
}

function exportMonthJSON() {
  const month   = alertMonthEl.value || currentMonth();
  const [y, mo] = month.split('-');
  const data = {
    exportDate: new Date().toISOString(),
    exportNote: `Backup dữ liệu nhà trọ - Tháng ${parseInt(mo)}/${y}`,
    month,
    settings:  state.settings,
    rooms:     state.rooms,
    readings:  state.readings.filter(r => r.month === month)
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `nhatro-${month}.json`;
  a.click();
  showToast(`Đã xuất: nhatro-${month}.json`, 'success');
}

document.getElementById('btnExportMonthCSV').addEventListener('click', exportMonthCSV);
document.getElementById('btnExportMonthJSON').addEventListener('click', exportMonthJSON);

// ---------- NAV TABS ----------
document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const tab = link.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'readings') renderReadings();
    if (tab === 'billing')  renderBilling();
    if (tab === 'report')   renderReport();
    if (tab === 'alerts')   { renderAlerts(); checkDayBanner(); }
  });
});

// Close modals on backdrop click
document.getElementById('modalRoom').addEventListener('click', e => {
  if (e.target === document.getElementById('modalRoom')) closeRoomModal();
});
document.getElementById('modalPrint').addEventListener('click', e => {
  if (e.target === document.getElementById('modalPrint'))
    document.getElementById('modalPrint').style.display = 'none';
});

// ---------- EXPORT / IMPORT ----------
document.getElementById('btnExport').addEventListener('click', () => {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `nhatro-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  showToast('Đã xuất dữ liệu', 'success');
});

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!imported.rooms || !imported.readings) throw new Error('Invalid');
      if (!confirm(`Nhập dữ liệu từ file "${file.name}"?\nDữ liệu hiện tại sẽ bị ghi đè.`)) return;
      state = imported;
      DB.save(state);
      loadSettingsUI();
      renderRooms();
      renderReadings();
      showToast('Đã nhập dữ liệu thành công', 'success');
    } catch {
      showToast('File không hợp lệ', 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ---------- INIT ----------
loadSettingsUI();
renderRooms();
updateAlertBadge();

// Thông báo ngày 20/27 ngay khi mở app
(function checkDayOnLoad() {
  const day = new Date().getDate();
  if (day === 20 || day === 27) {
    setTimeout(() => {
      showToast(`⚠️ Hôm nay ngày ${day} — Vào tab Cảnh Báo để gửi nhắc thu tiền!`, '');
    }, 1500);
  }
})();
