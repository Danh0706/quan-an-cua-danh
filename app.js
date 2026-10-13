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
  function toast(msg) {
    const el=$("toast"); el.textContent=msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600);
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
    if(!result.settings.length) {result.settings=[defaults().settings[0]]; await put("settings",result.settings[0]);}
    return result;
  }
  function setting(data) {return data.settings.find(s=>s.id==="main")||defaults().settings[0];}
  function salesSummary(sales) {
    return sales.reduce((a,s)=>{const rows=Array.isArray(s.rows)?s.rows:[];rows.forEach(r=>{a.revenue+=number(r.price)*number(r.count);a.orders+=number(r.count);});return a;},{revenue:0,orders:0}); 
  }
  function dayStats(data,date) {
    const sales=data.sales.filter(x=>x.date===date), purchases=data.purchases.filter(x=>x.date===date), expenses=data.expenses.filter(x=>x.date===date);
    const rev=salesSummary(sales), purchaseTotal=purchases.reduce((a,x)=>a+number(x.total),0), expenseTotal=expenses.reduce((a,x)=>a+number(x.amount),0);
    const cost=rev.orders*number(setting(data).costPerServing);
    return {date,revenue:rev.revenue,orders:rev.orders,purchaseTotal,expenseTotal,cashOut:purchaseTotal+expenseTotal,net:rev.revenue-purchaseTotal-expenseTotal,profit:rev.revenue-cost-expenseTotal,sales,purchases,expenses,cost};
  }
  function escapeHtml(value) {return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function go(page) {
    document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    if(page==="dashboard") renderDashboard();
    if(page==="sales") renderSalesList();
    if(page==="purchases") renderPurchaseList();
    if(page==="expenses") renderExpenseList();
    if(page==="reports") renderReports();
    if(page==="data") updateStorageStatus();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function initDates() {
    ["dashboardDate","salesDate","salesListDate","purchaseDate","purchaseListDate","expenseDate","expenseListDate"].forEach(id=>$(id).value=today());
    $("reportMonth").value=monthOf(today());
  }
  function renderPriceRows(prices) {
    const host=$("priceRows"); host.innerHTML="";
    (prices||[]).forEach((p,i)=>{
      const row=document.createElement("div"); row.className="price-row";
      row.innerHTML=`<div><span class="price-label">Mức giá ${i+1}</span><input type="number" min="0" step="1" class="row-price" value="${number(p.price)}" aria-label="Giá bán mức ${i+1}" placeholder="Giá bán"></div><div><span class="price-label">Số suất</span><input type="number" min="0" step="1" class="row-count" value="${number(p.count)}" aria-label="Số suất mức ${i+1}" placeholder="0"></div><button type="button" class="remove-price" aria-label="Xóa mức giá">×</button>`;
      row.querySelectorAll("input").forEach(input=>input.addEventListener("input",updateSalesCalc));
      row.querySelector(".remove-price").addEventListener("click",()=>{row.remove();updateSalesCalc();});
      host.appendChild(row);
    }); updateSalesCalc();
  }
  function getPriceRows() {
    return [...$("priceRows").querySelectorAll(".price-row")].map(row=>({price:number(row.querySelector(".row-price").value),count:Math.floor(number(row.querySelector(".row-count").value))})).filter(r=>r.price>0);
  }
  function updateSalesCalc() {
    const rows=getPriceRows(); const total=rows.reduce((a,r)=>a+r.price*r.count,0);const count=rows.reduce((a,r)=>a+r.count,0);
    $("salesTotal").textContent=money(total);$("salesCount").textContent=`${count.toLocaleString("vi-VN")} suất`;
  }
  function resetSalesForm() {
    $("salesForm").reset();$("salesId").value="";$("salesDate").value=$("salesListDate").value||today();
    $("salesNote").value="";$("salesCancel").hidden=true;$("salesForm").querySelector('button[type="submit"]').textContent="Lưu doanh thu";
    renderPriceRows((window.appSettings?.prices||[25000,30000,35000]).map(price=>({price,count:0})));
  }
  function resetPurchaseForm() {
    $("purchaseForm").reset();$("purchaseId").value="";$("purchaseDate").value=$("purchaseListDate").value||today();
    $("purchaseCancel").hidden=true;$("purchaseForm").querySelector('button[type="submit"]').textContent="Lưu khoản nhập";updatePurchaseCalc();
  }
  function resetExpenseForm() {
    $("expenseForm").reset();$("expenseId").value="";$("expenseDate").value=$("expenseListDate").value||today();
    $("expenseCancel").hidden=true;$("expenseForm").querySelector('button[type="submit"]').textContent="Lưu khoản chi";
  }
  function updatePurchaseCalc(){ $("purchaseTotal").textContent=money(number($("purchaseQty").value)*number($("purchasePrice").value));}
  async function renderDashboard() {
    const data=await allData(),date=$("dashboardDate").value||today(),s=dayStats(data,date);
    $("dashRevenue").textContent=money(s.revenue);$("dashOrders").textContent=`${s.orders.toLocaleString("vi-VN")} suất`;
    $("dashCashOut").textContent=money(s.cashOut);$("dashProfit").textContent=money(s.profit);$("dashNet").textContent=money(s.net);
    const activities=[];
    s.sales.forEach(x=>activities.push({date:x.date,type:"Doanh thu",name:x.note||"Ghi doanh thu",amount:salesSummary([x]).revenue,sub:`${salesSummary([x]).orders} suất`,kind:"sales",id:x.id}));
    s.purchases.forEach(x=>activities.push({date:x.date,type:"Nhập hàng",name:x.name,amount:x.total,sub:`${x.qty} ${x.unit||""} × ${money(x.unitPrice)}`,kind:"purchases",id:x.id}));
    s.expenses.forEach(x=>activities.push({date:x.date,type:"Chi phí",name:x.name,amount:x.amount,sub:x.note||"Chi phí khác",kind:"expenses",id:x.id}));
    activities.sort((a,b)=>String(b.id).localeCompare(String(a.id)));
    $("todayActivity").innerHTML=activities.length?activities.map(a=>`<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(a.name)}</div><div class="entry-sub">${escapeHtml(a.type)} · ${escapeHtml(a.sub)}</div></div><div class="entry-amount">${money(a.amount)}</div></div>`).join(""):'<div class="empty-state">Chưa có giao dịch trong ngày.</div>';
  }
  function actionButtons(kind,id){return `<div class="entry-actions"><button class="mini-button" data-edit="${kind}" data-id="${escapeHtml(id)}">Sửa</button><button class="mini-button delete" data-delete="${kind}" data-id="${escapeHtml(id)}">Xóa</button></div>`;}
  function bindListActions(host) {
    host.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editRecord(b.dataset.edit,b.dataset.id)));
    host.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteRecord(b.dataset.delete,b.dataset.id)));
  }
  async function renderSalesList() {
    const date=$("salesListDate").value||today(),data=await allData();
    const items=data.sales.filter(x=>x.date===date).sort((a,b)=>String(b.id).localeCompare(String(a.id)));
    const host=$("salesList");
    host.innerHTML=items.length?items.map(x=>{const sum=salesSummary([x]);return `<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.note||"Ghi doanh thu")}</div><div class="entry-sub">${(x.rows||[]).map(r=>`${r.count} suất × ${money(r.price)}`).join(" · ")}<br>${dateLabel(x.date)}</div>${actionButtons("sales",x.id)}</div><div class="entry-amount">${money(sum.revenue)}</div></div>`;}).join(""):'<div class="empty-state">Ngày này chưa có doanh thu.</div>';
    bindListActions(host);
  }
  async function renderPurchaseList() {
    const date=$("purchaseListDate").value||today(),data=await allData(),items=data.purchases.filter(x=>x.date===date).sort((a,b)=>String(b.id).localeCompare(String(a.id))),host=$("purchaseList");
    const total=items.reduce((a,x)=>a+number(x.total),0);
    host.innerHTML=items.length?`<div class="entry"><div class="entry-main"><div class="entry-title">Tổng tiền nhập ngày ${dateLabel(date)}</div></div><div class="entry-amount">${money(total)}</div></div>`+items.map(x=>`<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.name)}</div><div class="entry-sub">${number(x.qty)} ${escapeHtml(x.unit||"đơn vị")} × ${money(x.unitPrice)}${x.note?`<br>${escapeHtml(x.note)}`:""}</div>${actionButtons("purchases",x.id)}</div><div class="entry-amount">${money(x.total)}</div></div>`).join(""):'<div class="empty-state">Ngày này chưa có khoản nhập hàng.</div>';
    bindListActions(host);
  }
  async function renderExpenseList() {
    const date=$("expenseListDate").value||today(),data=await allData(),items=data.expenses.filter(x=>x.date===date).sort((a,b)=>String(b.id).localeCompare(String(a.id))),host=$("expenseList");
    const total=items.reduce((a,x)=>a+number(x.amount),0);
    host.innerHTML=items.length?`<div class="entry"><div class="entry-main"><div class="entry-title">Tổng chi phí khác ngày ${dateLabel(date)}</div></div><div class="entry-amount">${money(total)}</div></div>`+items.map(x=>`<div class="entry"><div class="entry-main"><div class="entry-title">${escapeHtml(x.name)}</div><div class="entry-sub">${dateLabel(x.date)}${x.note?` · ${escapeHtml(x.note)}`:""}</div>${actionButtons("expenses",x.id)}</div><div class="entry-amount">${money(x.amount)}</div></div>`).join(""):'<div class="empty-state">Ngày này chưa có khoản chi.</div>';
    bindListActions(host);
  }
  async function editRecord(kind,id) {
    const store=kind==="sales"?"sales":kind==="purchases"?"purchases":"expenses",items=await getAll(store),x=items.find(a=>a.id===id);if(!x)return;
    if(kind==="sales") {
      go("sales");$("salesId").value=x.id;$("salesDate").value=x.date;$("salesNote").value=x.note||"";
      renderPriceRows((x.rows||[]).map(r=>({price:r.price,count:r.count})));$("salesCancel").hidden=false;$("salesForm").querySelector('button[type="submit"]').textContent="Cập nhật doanh thu";
      $("salesForm").scrollIntoView({behavior:"smooth",block:"start"});
    } else if(kind==="purchases") {
      go("purchases");$("purchaseId").value=x.id;$("purchaseDate").value=x.date;$("purchaseName").value=x.name;$("purchaseQty").value=x.qty;$("purchaseUnit").value=x.unit||"";$("purchasePrice").value=x.unitPrice;$("purchaseNote").value=x.note||"";updatePurchaseCalc();$("purchaseCancel").hidden=false;$("purchaseForm").querySelector('button[type="submit"]').textContent="Cập nhật khoản nhập";$("purchaseForm").scrollIntoView({behavior:"smooth",block:"start"});
    } else {
      go("expenses");$("expenseId").value=x.id;$("expenseDate").value=x.date;$("expenseName").value=x.name;$("expenseAmount").value=x.amount;$("expenseNote").value=x.note||"";$("expenseCancel").hidden=false;$("expenseForm").querySelector('button[type="submit"]').textContent="Cập nhật khoản chi";$("expenseForm").scrollIntoView({behavior:"smooth",block:"start"});
    }
  }
  async function deleteRecord(kind,id) {
    const labels={sales:"bản ghi doanh thu",purchases:"khoản nhập hàng",expenses:"khoản chi"};
    if(!confirm(`Bạn có chắc muốn xóa ${labels[kind]} này?`))return;
    await remove(kind,id);toast("Đã xóa giao dịch.");
    await refreshAll();
  }
  async function renderReports() {
    const data=await allData(),month=$("reportMonth").value||monthOf(today()),daily={};
    const dates=new Set();
    [...data.sales,...data.purchases,...data.expenses].filter(x=>monthOf(x.date)===month).forEach(x=>dates.add(x.date));
    const rows=[...dates].sort().map(date=>dayStats(data,date));
    const total=rows.reduce((a,s)=>({revenue:a.revenue+s.revenue,cashOut:a.cashOut+s.cashOut,profit:a.profit+s.profit,net:a.net+s.net}),{revenue:0,cashOut:0,profit:0,net:0});
    $("reportRevenue").textContent=money(total.revenue);$("reportCashOut").textContent=money(total.cashOut);$("reportProfit").textContent=money(total.profit);$("reportNet").textContent=money(total.net);
    $("reportTable").innerHTML=rows.length?rows.map(s=>`<tr><td>${dateLabel(s.date)}</td><td>${money(s.revenue)}</td><td>${money(s.cashOut)}</td><td>${money(s.profit)}</td></tr>`).join(""):'<tr><td colspan="4" style="text-align:center;color:#718078">Chưa có dữ liệu trong tháng.</td></tr>';
    $("costPerServing").value=number(setting(data).costPerServing);
    window.reportRows=rows;
  }
  async function refreshAll() {
    await Promise.all([renderDashboard(),renderSalesList(),renderPurchaseList(),renderExpenseList(),renderReports(),updateStorageStatus()]);
  }
  async function updateStorageStatus() {
    try {
      const data=await allData(),count=data.sales.length+data.purchases.length+data.expenses.length;
      $("storageStatus").textContent=`Đang lưu trên thiết bị này · ${count} bản ghi giao dịch.`;
    } catch(e) {$("storageStatus").textContent="Không đọc được trạng thái lưu trữ.";}
  }
  function downloadBlob(blob,name) {
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function backup() {
    const data=await allData();data.app="SoThuChiCuaHang";data.version=1;data.exportedAt=new Date().toISOString();
    downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"}),`sao-luu-so-thu-chi-${today()}.json`);toast("Đã tạo tệp sao lưu JSON.");
  }
  async function restore(file) {
    if(!file)return;
    try {
      const parsed=JSON.parse(await file.text());
      if(parsed.app!=="SoThuChiCuaHang"||!Array.isArray(parsed.sales)||!Array.isArray(parsed.purchases)||!Array.isArray(parsed.expenses)||!Array.isArray(parsed.settings)) throw new Error("Tệp không đúng định dạng sao lưu của ứng dụng.");
      if(!confirm(`Phục hồi ${parsed.sales.length+parsed.purchases.length+parsed.expenses.length} bản ghi? Dữ liệu hiện tại sẽ bị thay thế.`))return;
      await replaceAll(parsed);window.appSettings=setting(await allData());toast("Đã phục hồi dữ liệu.");await refreshAll();
    } catch(e) {alert(`Không thể phục hồi: ${e.message||"Tệp không hợp lệ"}`);}
    finally {$("restoreFile").value="";}
  }
  function csvCell(v){return `"${String(v??"").replace(/"/g,'""')}"`;}
  async function exportCSV(all=false) {
    const data=await allData(),rows=[["Loại","Ngày","Tên / ghi chú","Số lượng","Đơn vị","Đơn giá","Thành tiền"]];
    data.sales.filter(x=>all||monthOf(x.date)===$("reportMonth").value).forEach(x=>(x.rows||[]).forEach(r=>rows.push(["Doanh thu",x.date,x.note||"Bán hàng",r.count,"suất",r.price,r.count*r.price])));
    data.purchases.filter(x=>all||monthOf(x.date)===$("reportMonth").value).forEach(x=>rows.push(["Nhập hàng",x.date,x.name,x.qty,x.unit,x.unitPrice,x.total]));
    data.expenses.filter(x=>all||monthOf(x.date)===$("reportMonth").value).forEach(x=>rows.push(["Chi phí khác",x.date,x.name,"","","",x.amount]));
    const csv="\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),all?`so-thu-chi-${today()}.csv`:`so-thu-chi-${$("reportMonth").value}.csv`);
    toast("Đã xuất tệp CSV.");
  }
  function wireEvents() {
    document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.page)));
    document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
    $("dashboardDate").addEventListener("change",renderDashboard);
    $("salesListDate").addEventListener("change",renderSalesList);
    $("purchaseListDate").addEventListener("change",renderPurchaseList);
    $("expenseListDate").addEventListener("change",renderExpenseList);
    $("reportMonth").addEventListener("change",renderReports);
    $("addPriceBtn").addEventListener("click",()=>{const rows=getPriceRows();rows.push({price:0,count:0});renderPriceRows(rows);});
    $("salesForm").addEventListener("submit",async e=>{
      e.preventDefault();const rows=getPriceRows();if(!rows.length||!rows.some(r=>r.count>0)){alert("Hãy nhập ít nhất một mức giá có số suất lớn hơn 0.");return;}
      const item={id:$("salesId").value||uid(),date:$("salesDate").value,rows,note:$("salesNote").value.trim(),updatedAt:new Date().toISOString()};
      await put("sales",item);$("salesListDate").value=item.date;resetSalesForm();toast("Đã lưu doanh thu.");await refreshAll();
    });
    $("salesCancel").addEventListener("click",resetSalesForm);
    $("purchaseQty").addEventListener("input",updatePurchaseCalc);$("purchasePrice").addEventListener("input",updatePurchaseCalc);
    $("purchaseForm").addEventListener("submit",async e=>{
      e.preventDefault();const qty=number($("purchaseQty").value),unitPrice=number($("purchasePrice").value);
      if(qty<=0){alert("Số lượng phải lớn hơn 0.");return;}
      const item={id:$("purchaseId").value||uid(),date:$("purchaseDate").value,name:$("purchaseName").value.trim(),qty,unit:$("purchaseUnit").value.trim(),unitPrice,total:Math.round(qty*unitPrice),note:$("purchaseNote").value.trim(),updatedAt:new Date().toISOString()};
      await put("purchases",item);$("purchaseListDate").value=item.date;resetPurchaseForm();toast("Đã lưu khoản nhập.");await refreshAll();
    });
    $("purchaseCancel").addEventListener("click",resetPurchaseForm);
    $("expenseForm").addEventListener("submit",async e=>{
      e.preventDefault();const item={id:$("expenseId").value||uid(),date:$("expenseDate").value,name:$("expenseName").value.trim(),amount:number($("expenseAmount").value),note:$("expenseNote").value.trim(),updatedAt:new Date().toISOString()};
      await put("expenses",item);$("expenseListDate").value=item.date;resetExpenseForm();toast("Đã lưu khoản chi.");await refreshAll();
    });
    $("expenseCancel").addEventListener("click",resetExpenseForm);
    $("settingsForm").addEventListener("submit",async e=>{
      e.preventDefault();const data=await allData(),s=setting(data);s.costPerServing=number($("costPerServing").value);await put("settings",s);window.appSettings=s;toast("Đã lưu giá vốn mỗi suất.");await refreshAll();
    });
    $("backupBtn").addEventListener("click",backup);$("backupQuickBtn").addEventListener("click",backup);
    $("restoreBtn").addEventListener("click",()=>$("restoreFile").click());
    $("restoreFile").addEventListener("change",e=>restore(e.target.files?.[0]));
    $("allCsvBtn").addEventListener("click",()=>exportCSV(true));$("exportCsvBtn").addEventListener("click",()=>exportCSV(false));
    $("clearDataBtn").addEventListener("click",async()=>{
      if(!confirm("XÓA TOÀN BỘ giao dịch trên thiết bị này? Hành động không thể hoàn tác. Hãy sao lưu trước nếu cần."))return;
      if(!confirm("Xác nhận lần cuối: xóa toàn bộ doanh thu, nhập hàng và chi phí?"))return;
      const keep=(await allData()).settings;await replaceAll({sales:[],purchases:[],expenses:[],settings:keep});toast("Đã xóa các giao dịch.");await refreshAll();
    });
  }
  async function init() {
    try {
      if(!("indexedDB" in window)) throw new Error("Trình duyệt này không hỗ trợ lưu dữ liệu.");
      db=await openDB();initDates();wireEvents();
      const data=await allData();window.appSettings=setting(data);
      resetSalesForm();updatePurchaseCalc();
      await refreshAll();
      if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
    } catch(e) {
      document.body.innerHTML=`<main><div class="panel"><h2>Không thể mở sổ thu chi</h2><p>${escapeHtml(e.message||"Lỗi khởi tạo dữ liệu")}</p><p>Hãy mở ứng dụng bằng Safari hoặc trình duyệt hiện đại qua HTTPS.</p></div></main>`;
    }
  }
  document.addEventListener("DOMContentLoaded",init);
})();