(() => {
  "use strict";
  const DB_NAME = "so-thu-chi-cua-hang";
  const DB_VERSION = 1;
  const STORE_NAMES = ["sales", "purchases", "expenses", "settings"];
  let db;
  let toastTimer;
  const $ = (id) => document.getElementById(id);
  const today = () => localDateString(new Date());
  const localDateString = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const money = (n) => `${Math.round(Number(n)||0).toLocaleString("vi-VN")} ₫`;
  const number = (v) => Math.max(0, Number(v) || 0);
  const uid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const monthOf = (date) => (date || "").slice(0,7);
  const dateLabel = (s) => { if(!s) return ""; const [y,m,d]=s.split("-"); return `${d}/${m}/${y}`; };
  const productLabel = (product) => ({mi:"Mỳ", com:"Cơm"}[product] || "Mỳ");

  function toast(msg) {
    const el=$("toast"); if(!el) return; el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600);
  }

  function openDB() {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{ const d=req.result; STORE_NAMES.forEach(n=>{if(!d.objectStoreNames.contains(n)) d.createObjectStore(n,{keyPath:"id"});}); };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }

  function getAll(store) {
    return new Promise((resolve,reject)=>{const r=db.transaction(store,"readonly").objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});
  }

  function put(store,item) {
    return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(item);tx.oncomplete=()=>resolve(item);tx.onerror=()=>reject(tx.error);});
  }

  function remove(store,id) {
    return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  }

  async function replaceAll(data) {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAMES,"readwrite");
      STORE_NAMES.forEach(name=>{const store=tx.objectStore(name);store.clear();(data[name]||[]).forEach(item=>store.put(item));});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Không thể phục hồi dữ liệu"));
    });
  }

  const defaults = () => ({sales:[],purchases:[],expenses:[],settings:[{id:"main",costPerServing:0,prices:[25000,30000,35000]}]});

  async function allData() {
    const result={}; for(const name of STORE_NAMES) result[name]=await getAll(name);
    if(!result.settings.length){ result.settings=[defaults().settings[0]]; await put("settings", result.settings[0]); }
    return result;
  }

  function setting(data){ return data.settings.find(s=>s.id==="main") || defaults().settings[0]; }

  function salesSummary(sales, productFilter) {
    return sales.reduce((acc, sale) => {
      const rows = Array.isArray(sale.rows) ? sale.rows : [];
      rows.forEach(row => {
        if (!productFilter || row.product === productFilter) {
          acc.revenue += number(row.price) * number(row.count);
          acc.orders += number(row.count);
        }
      });
      return acc;
    }, {revenue:0, orders:0});
  }

  function dayStats(data, date, productFilter) {
    const sales = data.sales.filter(x => x.date === date);
    const purchases = data.purchases.filter(x => x.date === date);
    const expenses = data.expenses.filter(x => x.date === date);
    const rev = salesSummary(sales, productFilter);
    const purchaseTotal = purchases.reduce((a,x) => a + number(x.total), 0);
    const expenseTotal = expenses.reduce((a,x) => a + number(x.amount), 0);
    const cost = rev.orders * number(setting(data).costPerServing);
    return {date, revenue: rev.revenue, orders: rev.orders, purchaseTotal, expenseTotal, cashOut: purchaseTotal + expenseTotal, net: rev.revenue - purchaseTotal - expenseTotal, profit: rev.revenue - cost - expenseTotal, sales, purchases, expenses};
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }

  function go(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === `page-${page}`));
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
    if(page === "dashboard") renderDashboard();
    if(page === "sales") renderSalesList();
    if(page === "purchases") renderPurchaseList();
    if(page === "expenses") renderExpenseList();
    if(page === "reports") renderReports();
    if(page === "data") updateStorageStatus();
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function initDates() {
    ["salesDate","salesListDate","purchaseDate","purchaseListDate","expenseDate","expenseListDate"].forEach(id => {
      if($(id)) $(id).value = today();
    });
    if($("dashboardMonth")) $("dashboardMonth").value = monthOf(today());
    if($("reportMonth")) $("reportMonth").value = monthOf(today());
  }

  function renderPriceRows(prices) {
    const host = $("priceRows"); if(!host) return;
    host.innerHTML = "";
    (prices || []).forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "price-row";
      const product = p.product || "mi";
      row.innerHTML = `
        <div class="price-column">
          <label class="price-label">Mức giá ${i + 1}</label>
          <input type="number" inputmode="numeric" min="0" step="1" class="row-price" value="${number(p.price)}" aria-label="Giá bán mức ${i + 1}">
        </div>
        <div class="product-column">
          <label class="price-label">Loại</label>
          <select class="row-product" aria-label="Loại món mức ${i + 1}">
            <option value="mi" ${product === "mi" ? "selected" : ""}>Mỳ</option>
            <option value="com" ${product === "com" ? "selected" : ""}>Cơm</option>
          </select>
        </div>
        <div class="count-column">
          <label class="price-label">Số suất</label>
          <div class="count-controls">
            <button type="button" class="count-button decrement" aria-label="Giảm">−</button>
            <input type="number" class="row-count" value="${Math.floor(number(p.count))}" min="0" readonly aria-label="Số suất mức ${i + 1}">
            <button type="button" class="count-button increment" aria-label="Tăng">＋</button>
          </div>
        </div>
        <button type="button" class="remove-price" aria-label="Xóa mức giá">✕</button>
      `;

      row.querySelector(".row-price").addEventListener("input", updateSalesCalc);
      row.querySelector(".row-product").addEventListener("change", updateSalesCalc);
      row.querySelector(".increment").addEventListener("click", () => {
        const input = row.querySelector(".row-count");
        input.value = Number(input.value || 0) + 1;
        updateSalesCalc();
      });
      row.querySelector(".decrement").addEventListener("click", () => {
        const input = row.querySelector(".row-count");
        input.value = Math.max(0, Number(input.value || 0) - 1);
        updateSalesCalc();
      });
      row.querySelector(".remove-price").addEventListener("click", () => {
        row.remove();
        updateSalesCalc();
      });
      host.appendChild(row);
    });
    updateSalesCalc();
  }

  function getPriceRows() {
    const host = $("priceRows");
    if(!host) return [];
    return [...host.querySelectorAll(".price-row")].map(row => ({
      price: number(row.querySelector(".row-price").value),
      count: Math.floor(number(row.querySelector(".row-count").value)),
      product: row.querySelector(".row-product").value || "mi"
    }));
  }

  function updateSalesCalc() {
    const rows = getPriceRows();
    const total = rows.reduce((a, r) => a + r.price * r.count, 0);
    const count = rows.reduce((a, r) => a + r.count, 0);
    if($("salesTotal")) $("salesTotal").textContent = money(total);
    if($("salesCount")) $("salesCount").textContent = `${count.toLocaleString("vi-VN")} suất`;
  }

  function resetSalesForm() {
    if(!$("salesForm")) return;
    $("salesForm").reset();
    if($("salesId")) $("salesId").value = "";
    if($("salesDate")) $("salesDate").value = $("salesListDate") ? $("salesListDate").value || today() : today();
    if($("salesNote")) $("salesNote").value = "";
    if($("salesCancel")) $("salesCancel").hidden = true;
    const submitBtn = $("salesForm").querySelector('button[type="submit"]');
    if(submitBtn) submitBtn.textContent = "Lưu doanh thu";
    renderPriceRows((window.appSettings?.prices || [25000,30000,35000]).map(price => ({price, count:0, product:"mi"})));
  }

  function resetPurchaseForm() {
    if(!$("purchaseForm")) return;
    $("purchaseForm").reset();
    if($("purchaseId")) $("purchaseId").value = "";
    if($("purchaseDate")) $("purchaseDate").value = $("purchaseListDate") ? $("purchaseListDate").value || today() : today();
    if($("purchaseCancel")) $("purchaseCancel").hidden = true;
    const submitBtn = $("purchaseForm").querySelector('button[type="submit"]');
    if(submitBtn) submitBtn.textContent = "Lưu khoản nhập";
    updatePurchaseCalc();
  }

  function resetExpenseForm() {
    if(!$("expenseForm")) return;
    $("expenseForm").reset();
    if($("expenseId")) $("expenseId").value = "";
    if($("expenseDate")) $("expenseDate").value = $("expenseListDate") ? $("expenseListDate").value || today() : today();
    if($("expenseCancel")) $("expenseCancel").hidden = true;
    const submitBtn = $("expenseForm").querySelector('button[type="submit"]');
    if(submitBtn) submitBtn.textContent = "Lưu khoản chi";
  }

  function updatePurchaseCalc() {
    if(!$("purchaseTotal")) return;
    $("purchaseTotal").textContent = money(number($("purchaseQty").value) * number($("purchasePrice").value));
  }

  function showDayDetails(date, data, productFilter) {
    const container = $("dashboardDayDetails");
    if(!container) return;
    const sales = (data.sales || []).filter(x => x.date === date && (!productFilter || (x.rows || []).some(r => r.product === productFilter)));
    const purchases = (data.purchases || []).filter(x => x.date === date);
    const expenses = (data.expenses || []).filter(x => x.date === date);

    let html = `<div class="day-details"><h4>Chi tiết ${dateLabel(date)}</h4>`;

    if(sales.length) {
      html += `<div class="detail-section"><strong>Doanh thu</strong>` + sales.map(x => {
        const rows = (x.rows || []).filter(r => !productFilter || r.product === productFilter);
        const sum = salesSummary([x], productFilter);
        return `<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.note || "Ghi doanh thu")}</div><div class="entry-sub">${rows.map(r => `${productLabel(r.product || "mi")}: ${r.count} suất × ${money(r.price)}`).join(" • ") || "Doanh thu"}</div></div><div class="entry-amount">${money(sum.revenue)}</div></div>`;
      }).join("") + `</div>`;
    }

    if(purchases.length) {
      html += `<div class="detail-section"><strong>Nhập hàng</strong>` + purchases.map(x => `<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.name)}</div><div class="entry-sub">${x.qty} ${x.unit || ""} × ${money(x.unitPrice)}</div></div><div class="entry-amount">${money(x.total)}</div></div>`).join("") + `</div>`;
    }

    if(expenses.length) {
      html += `<div class="detail-section"><strong>Chi phí khác</strong>` + expenses.map(x => `<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.name)}</div><div class="entry-sub">${escapeHtml(x.note || "Chi phí khác")}</div></div><div class="entry-amount">${money(x.amount)}</div></div>`).join("") + `</div>`;
    }

    if(!sales.length && !purchases.length && !expenses.length) html += `<div class="empty-state">Không có giao dịch trong ngày này.</div>`;
    html += `<div class="button-row"><button type="button" class="secondary-button" id="closeDayDetails">Đóng</button></div></div>`;
    container.innerHTML = html;
    const closeBtn = $("closeDayDetails");
    if(closeBtn) closeBtn.addEventListener("click", () => { container.innerHTML = ""; });
  }

  async function renderDashboard() {
    const data = await allData();
    const month = $("dashboardMonth") ? $("dashboardMonth").value || monthOf(today()) : monthOf(today());
    const productFilter = $("dashboardProductFilter") ? $("dashboardProductFilter").value || null : null;
    const dates = new Set();
    [...data.sales, ...data.purchases, ...data.expenses].filter(x => monthOf(x.date) === month).forEach(x => dates.add(x.date));
    const rows = [...dates].sort().map(date => dayStats(data, date, productFilter));
    const total = rows.reduce((a, s) => ({ revenue: a.revenue + s.revenue, cashOut: a.cashOut + s.cashOut, profit: a.profit + s.profit, net: a.net + s.net }), { revenue: 0, cashOut: 0, profit: 0, net: 0 });

    if($("dashRevenue")) $("dashRevenue").textContent = money(total.revenue);
    if($("dashOrders")) $("dashOrders").textContent = `${rows.reduce((a, s) => a + s.orders, 0).toLocaleString("vi-VN")} suất`;
    if($("dashCashOut")) $("dashCashOut").textContent = money(total.cashOut);
    if($("dashProfit")) $("dashProfit").textContent = money(total.profit);
    if($("dashNet")) $("dashNet").textContent = money(total.net);

    const host = $("dashboardMonthTable");
    if(!host) return;
    if(!rows.length) {
      host.innerHTML = '<div class="empty-state">Chưa có giao dịch trong tháng.</div>';
      return;
    }

    host.innerHTML = `
      <table class="month-summary-table">
        <thead><tr><th>Ngày</th><th>Doanh thu</th><th>Chi</th><th>Lãi</th><th></th></tr></thead>
        <tbody>${rows.map(s => `<tr><td>${dateLabel(s.date)}</td><td>${money(s.revenue)}</td><td>${money(s.cashOut)}</td><td>${money(s.profit)}</td><td><button type="button" class="mini-button view-day" data-date="${s.date}">Xem</button></td></tr>`).join("")}</tbody>
      </table>
      <div id="dashboardDayDetails"></div>
    `;

    host.querySelectorAll(".view-day").forEach(btn => btn.addEventListener("click", () => showDayDetails(btn.dataset.date, data, productFilter)));
  }

  function actionButtons(kind, id) {
    return `<div class="entry-actions"><button class="mini-button" data-edit="${kind}" data-id="${escapeHtml(id)}">Sửa</button><button class="mini-button delete" data-delete="${kind}" data-id="${escapeHtml(id)}">Xóa</button></div>`;
  }

  function bindListActions(host) {
    if(!host) return;
    host.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editRecord(b.dataset.edit, b.dataset.id)));
    host.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => deleteRecord(b.dataset.delete, b.dataset.id)));
  }

  async function renderSalesList() {
    const date = $("salesListDate").value || today();
    const data = await allData();
    const items = data.sales.filter(x => x.date === date).sort((a,b) => String(b.id).localeCompare(String(a.id)));
    const host = $("salesList");
    if(!host) return;
    host.innerHTML = items.length ? items.map(x => {
      const sum = salesSummary([x]);
      const rows = (x.rows || []).map(r => `${productLabel(r.product || "mi")}: ${r.count} × ${money(r.price)}`).join(" • ");
      return `<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.note || "Ghi doanh thu")}</div><div class="entry-sub">${escapeHtml(rows || "Doanh thu")}</div></div><div class="entry-amount">${money(sum.revenue)}${actionButtons("sales", x.id)}</div></div>`;
    }).join("") : '<div class="empty-state">Chưa có ghi doanh thu trong ngày này.</div>';
    bindListActions(host);
  }

  async function renderPurchaseList() {
    const date = $("purchaseListDate").value || today();
    const data = await allData();
    const items = data.purchases.filter(x => x.date === date).sort((a,b) => String(b.id).localeCompare(String(a.id)));
    const host = $("purchaseList");
    if(!host) return;
    const total = items.reduce((a,x) => a + number(x.total), 0);
    host.innerHTML = items.length ? `<div class="entry"><div class="entry-main"><div class="entry-title">Tổng tiền nhập ngày ${dateLabel(date)}</div></div><div class="entry-amount">${money(total)}</div></div>` + items.map(x => `<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.name)}</div><div class="entry-sub">${x.qty} ${x.unit || ""} × ${money(x.unitPrice)}</div></div><div class="entry-amount">${money(x.total)}${actionButtons("purchases", x.id)}</div></div>`).join("") : '<div class="empty-state">Chưa có khoản nhập hàng trong ngày này.</div>';
    bindListActions(host);
  }

  async function renderExpenseList() {
    const date = $("expenseListDate").value || today();
    const data = await allData();
    const items = data.expenses.filter(x => x.date === date).sort((a,b) => String(b.id).localeCompare(String(a.id)));
    const host = $("expenseList");
    if(!host) return;
    const total = items.reduce((a,x) => a + number(x.amount), 0);
    host.innerHTML = items.length ? `<div class="entry"><div class="entry-main"><div class="entry-title">Tổng chi phí khác ngày ${dateLabel(date)}</div></div><div class="entry-amount">${money(total)}</div></div>` + items.map(x => `<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.name)}</div><div class="entry-sub">${escapeHtml(x.note || "Chi phí khác")}</div></div><div class="entry-amount">${money(x.amount)}${actionButtons("expenses", x.id)}</div></div>`).join("") : '<div class="empty-state">Chưa có khoản chi trong ngày này.</div>';
    bindListActions(host);
  }

  async function editRecord(kind, id) {
    const store = kind === "sales" ? "sales" : (kind === "purchases" ? "purchases" : "expenses");
    const items = await getAll(store);
    const x = items.find(a => a.id === id); if(!x) return;

    if(kind === "sales") {
      go("sales");
      $("salesId").value = x.id;
      $("salesDate").value = x.date;
      $("salesNote").value = x.note || "";
      renderPriceRows((x.rows || []).map(r => ({price:r.price, count:r.count, product:r.product || "mi"})));
      $("salesCancel").hidden = false;
      $("salesForm").querySelector('button[type="submit"]').textContent = "Cập nhật doanh thu";
      $("salesForm").scrollIntoView({behavior:"smooth", block:"start"});
    } else if(kind === "purchases") {
      go("purchases");
      $("purchaseId").value = x.id;
      $("purchaseDate").value = x.date;
      $("purchaseName").value = x.name;
      $("purchaseQty").value = x.qty;
      $("purchaseUnit").value = x.unit || "";
      $("purchasePrice").value = x.unitPrice;
      $("purchaseNote").value = x.note || "";
      $("purchaseCancel").hidden = false;
      $("purchaseForm").querySelector('button[type="submit"]').textContent = "Cập nhật khoản nhập";
      updatePurchaseCalc();
      $("purchaseForm").scrollIntoView({behavior:"smooth", block:"start"});
    } else {
      go("expenses");
      $("expenseId").value = x.id;
      $("expenseDate").value = x.date;
      $("expenseName").value = x.name;
      $("expenseAmount").value = x.amount;
      $("expenseNote").value = x.note || "";
      $("expenseCancel").hidden = false;
      $("expenseForm").querySelector('button[type="submit"]').textContent = "Cập nhật khoản chi";
      $("expenseForm").scrollIntoView({behavior:"smooth", block:"start"});
    }
  }

  async function deleteRecord(kind, id) {
    const labels = {sales:"bản ghi doanh thu", purchases:"khoản nhập hàng", expenses:"khoản chi"};
    if(!confirm(`Bạn có chắc muốn xóa ${labels[kind]} này?`)) return;
    await remove(kind, id);
    toast("Đã xóa giao dịch.");
    await refreshAll();
  }

  async function renderReports() {
    const data = await allData();
    const productFilter = $("reportProductFilter") ? $("reportProductFilter").value || null : null;
    const month = $("reportMonth").value || monthOf(today());
    const dates = new Set();
    [...data.sales, ...data.purchases, ...data.expenses].filter(x => monthOf(x.date) === month).forEach(x => dates.add(x.date));
    const rows = [...dates].sort().map(date => dayStats(data, date, productFilter));
    const total = rows.reduce((a,s)=>({revenue: a.revenue + s.revenue, cashOut: a.cashOut + s.cashOut, profit: a.profit + s.profit, net: a.net + s.net}), {revenue:0, cashOut:0, profit:0, net:0});
    if($("reportRevenue")) $("reportRevenue").textContent = money(total.revenue);
    if($("reportCashOut")) $("reportCashOut").textContent = money(total.cashOut);
    if($("reportProfit")) $("reportProfit").textContent = money(total.profit);
    if($("reportNet")) $("reportNet").textContent = money(total.net);

    const reportMonthTable = $("reportMonthTable");
    if(reportMonthTable) {
      const monthRows = Array.from(new Set([ ...data.sales, ...data.purchases, ...data.expenses ].map(x => monthOf(x.date))).filter(Boolean)).sort().reverse().map(m => {
        const monthSales = data.sales.filter(x => monthOf(x.date) === m);
        const monthPurchases = data.purchases.filter(x => monthOf(x.date) === m);
        const monthExpenses = data.expenses.filter(x => monthOf(x.date) === m);
        let revenue = 0, cashOut = 0, net = 0;
        monthSales.forEach(s => (s.rows || []).forEach(r => {
          if(!productFilter || r.product === productFilter) {
            revenue += number(r.price) * number(r.count);
            net += number(r.price) * number(r.count);
          }
        }));
        monthPurchases.forEach(x => { cashOut += number(x.total); net -= number(x.total); });
        monthExpenses.forEach(x => { cashOut += number(x.amount); net -= number(x.amount); });
        return { month:m, revenue, cashOut, net };
      });
      reportMonthTable.innerHTML = monthRows.length ? `<table class="month-summary-table"><thead><tr><th>Tháng</th><th>Doanh thu</th><th>Chi</th><th>Dòng tiền</th></tr></thead><tbody>${monthRows.map(r => `<tr><td>${r.month}</td><td>${money(r.revenue)}</td><td>${money(r.cashOut)}</td><td>${money(r.net)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty-state">Chưa có dữ liệu theo tháng.</div>';
    }

    if($("reportTable")) {
      $("reportTable").innerHTML = rows.length ? rows.map(s => `<tr><td>${dateLabel(s.date)}</td><td>${money(s.revenue)}</td><td>${money(s.cashOut)}</td><td>${money(s.profit)}</td></tr>`).join("") : '<tr><td colspan="4">Chưa có dữ liệu trong tháng.</td></tr>';
    }

    if($("costPerServing")) $("costPerServing").value = number(setting(data).costPerServing);
    window.reportRows = rows;
  }

  async function refreshAll() {
    await Promise.all([renderDashboard(), renderSalesList(), renderPurchaseList(), renderExpenseList(), renderReports(), updateStorageStatus()]);
  }

  async function updateStorageStatus() {
    try {
      const data = await allData();
      const count = data.sales.length + data.purchases.length + data.expenses.length;
      if($("storageStatus")) $("storageStatus").textContent = `Đang lưu trên thiết bị này · ${count} bản ghi giao dịch.`;
    } catch(e) {
      if($("storageStatus")) $("storageStatus").textContent = "Không đọc được trạng thái lưu trữ.";
    }
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function backup() {
    const data = await allData();
    data.app = "SoThuChiCuaHang"; data.version = 1; data.exportedAt = new Date().toISOString();
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], {type: "application/json;charset=utf-8"}), `sao-luu-so-thu-chi-${today()}.json`);
    toast("Đã tạo tệp sao lưu JSON.");
  }

  async function restore(file) {
    if(!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if(parsed.app !== "SoThuChiCuaHang" || !Array.isArray(parsed.sales) || !Array.isArray(parsed.purchases) || !Array.isArray(parsed.expenses) || !Array.isArray(parsed.settings)) throw new Error("Tệp không hợp lệ.");
      if(!confirm(`Phục hồi ${parsed.sales.length + parsed.purchases.length + parsed.expenses.length} bản ghi? Dữ liệu hiện tại sẽ bị thay thế.`)) return;
      await replaceAll(parsed); window.appSettings = setting(await allData()); toast("Đã phục hồi dữ liệu."); await refreshAll();
    } catch(e) { alert(`Không thể phục hồi: ${e.message || "Tệp không hợp lệ"}`); }
    finally { if($("restoreFile")) $("restoreFile").value = ""; }
  }

  function csvCell(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }

  async function exportCSV(all = false) {
    const data = await allData();
    const rows = [["Loại","Ngày","Tên / ghi chú","Số lượng","Đơn vị","Đơn giá","Thành tiền","Loại món"]];
    data.sales.filter(x => all || monthOf(x.date) === $("reportMonth").value).forEach(x => (x.rows || []).forEach(r => rows.push(["Doanh thu", x.date, x.note || "Bán hàng", r.count, "suất", r.price, r.count * r.price, productLabel(r.product || "mi")])))
    data.purchases.filter(x => all || monthOf(x.date) === $("reportMonth").value).forEach(x => rows.push(["Nhập hàng", x.date, x.name, x.qty, x.unit, x.unitPrice, x.total, ""]));
    data.expenses.filter(x => all || monthOf(x.date) === $("reportMonth").value).forEach(x => rows.push(["Chi phí khác", x.date, x.name, "", "", "", x.amount, ""]));
    const csv = "\ufeff" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob([csv], {type: "text/csv;charset=utf-8"}), all ? `so-thu-chi-${today()}.csv` : `so-thu-chi-${$("reportMonth").value}.csv`);
    toast("Đã xuất tệp CSV.");
  }

  function wireEvents() {
    document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));
    document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
    if($("dashboardMonth")) $("dashboardMonth").addEventListener("change", renderDashboard);
    if($("dashboardProductFilter")) $("dashboardProductFilter").addEventListener("change", renderDashboard);
    if($("salesListDate")) $("salesListDate").addEventListener("change", renderSalesList);
    if($("purchaseListDate")) $("purchaseListDate").addEventListener("change", renderPurchaseList);
    if($("expenseListDate")) $("expenseListDate").addEventListener("change", renderExpenseList);
    if($("reportMonth")) $("reportMonth").addEventListener("change", renderReports);
    if($("reportProductFilter")) $("reportProductFilter").addEventListener("change", renderReports);
    if($("addPriceBtn")) $("addPriceBtn").addEventListener("click", () => { const rows = getPriceRows(); rows.push({price:0, count:0, product:"mi"}); renderPriceRows(rows); });

    if($("salesForm")) $("salesForm").addEventListener("submit", async e => {
      e.preventDefault();
      const rows = getPriceRows();
      if(!rows.length || !rows.some(r => r.count > 0)) {
        alert("Hãy nhập ít nhất một mức giá có số suất lớn hơn 0.");
        return;
      }
      const item = { id: $("salesId").value || uid(), date: $("salesDate").value, rows, note: $("salesNote").value.trim(), updatedAt: new Date().toISOString() };
      await put("sales", item);
      if($("salesListDate")) $("salesListDate").value = item.date;
      resetSalesForm();
      toast("Đã lưu doanh thu.");
      await refreshAll();
    });
    if($("salesCancel")) $("salesCancel").addEventListener("click", resetSalesForm);

    if($("purchaseQty")) $("purchaseQty").addEventListener("input", updatePurchaseCalc);
    if($("purchasePrice")) $("purchasePrice").addEventListener("input", updatePurchaseCalc);
    if($("purchaseForm")) $("purchaseForm").addEventListener("submit", async e => {
      e.preventDefault();
      const qty = number($("purchaseQty").value);
      const unitPrice = number($("purchasePrice").value);
      if(qty <= 0) { alert("Số lượng phải lớn hơn 0."); return; }
      const item = { id: $("purchaseId").value || uid(), date: $("purchaseDate").value, name: $("purchaseName").value.trim(), qty, unit: $("purchaseUnit").value.trim(), unitPrice, total: Math.round(qty * unitPrice), note: $("purchaseNote").value.trim(), updatedAt: new Date().toISOString() };
      await put("purchases", item);
      if($("purchaseListDate")) $("purchaseListDate").value = item.date;
      resetPurchaseForm();
      toast("Đã lưu khoản nhập.");
      await refreshAll();
    });
    if($("purchaseCancel")) $("purchaseCancel").addEventListener("click", resetPurchaseForm);

    if($("expenseForm")) $("expenseForm").addEventListener("submit", async e => {
      e.preventDefault();
      const item = { id: $("expenseId").value || uid(), date: $("expenseDate").value, name: $("expenseName").value.trim(), amount: number($("expenseAmount").value), note: $("expenseNote").value.trim(), updatedAt: new Date().toISOString() };
      await put("expenses", item);
      if($("expenseListDate")) $("expenseListDate").value = item.date;
      resetExpenseForm();
      toast("Đã lưu khoản chi.");
      await refreshAll();
    });
    if($("expenseCancel")) $("expenseCancel").addEventListener("click", resetExpenseForm);

    if($("settingsForm")) $("settingsForm").addEventListener("submit", async e => {
      e.preventDefault();
      const data = await allData();
      const s = setting(data);
      s.costPerServing = number($("costPerServing").value);
      await put("settings", s);
      window.appSettings = s;
      toast("Đã lưu giá vốn mỗi suất.");
      await refreshAll();
    });

    if($("backupBtn")) $("backupBtn").addEventListener("click", backup);
    if($("backupQuickBtn")) $("backupQuickBtn").addEventListener("click", backup);
    if($("restoreBtn")) $("restoreBtn").addEventListener("click", () => $("restoreFile").click());
    if($("restoreFile")) $("restoreFile").addEventListener("change", e => restore(e.target.files?.[0]));
    if($("allCsvBtn")) $("allCsvBtn").addEventListener("click", () => exportCSV(true));
    if($("exportCsvBtn")) $("exportCsvBtn").addEventListener("click", () => exportCSV(false));
    if($("clearDataBtn")) $("clearDataBtn").addEventListener("click", async () => {
      if(!confirm("XÓA TOÀN BỘ giao dịch trên thiết bị này? Hành động không thể hoàn tác. Hãy sao lưu trước nếu cần.")) return;
      if(!confirm("Xác nhận lần cuối: xóa toàn bộ doanh thu, nhập hàng và chi phí?")) return;
      const keep=(await allData()).settings;
      await replaceAll({sales: [], purchases: [], expenses: [], settings: keep});
      toast("Đã xóa các giao dịch.");
      await refreshAll();
    });
  }

  async function init() {
    try {
      if(!("indexedDB" in window)) throw new Error("Trình duyệt này không hỗ trợ lưu dữ liệu.");
      db = await openDB();
      initDates();
      wireEvents();
      const data = await allData();
      window.appSettings = setting(data);
      resetSalesForm();
      updatePurchaseCalc();
      await refreshAll();
      if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});
    } catch(e) {
      document.body.innerHTML = `<main><div class="panel"><h2>Không thể mở sổ thu chi</h2><p>${escapeHtml(e.message || "Lỗi khởi tạo dữ liệu")}</p><p>Hãy mở ứng dụng bằng Safari hoặc Chrome trên thiết bị di động và cho phép lưu dữ liệu cục bộ.</p></div></main>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
