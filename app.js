import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAhanBvRjSePaZpdAwQaXZhnk7zPqKB2fw",
  authDomain: "robloxianfn.firebaseapp.com",
  projectId: "robloxianfn",
  storageBucket: "robloxianfn.firebasestorage.app",
  messagingSenderId: "909261155071",
  appId: "1:909261155071:web:9d5a52c28bdae740683aca"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const APP = {
  title: "RFN Write-Up System",
  sessionKey: "rfn_writeups_session_v1",
  roles: {
    discipline: "DisciplinePerms",
    ceo: "CEO",
    employee: "Employee"
  },
  expiresMode: {
    never: "Never",
    expiresOn: "ExpiresOn"
  },
  collections: {
    employees: "employees",
    writeups: "writeups",
    audit: "auditLogs",
    settings: "systemSettings"
  }
};

let TOKEN = "";
let ME = null;
let CAPS = { canCreate: false, canEdit: false, canDelete: false };
let LAST = [];
let SELECTED = null;

const $ = (id) => document.getElementById(id);

function todayISO(){ return new Date().toISOString().slice(0, 10); }
function newId(prefix){
  const stamp = new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace("T", "-").slice(0, 15);
  return `${prefix}-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}
function normalizeId(v){ return String(v || "").trim(); }
function normalizeText(v){ return String(v || "").trim(); }
function isKnownRole(role){ return Object.values(APP.roles).includes(role); }
function canCreate(session){ return [APP.roles.ceo, APP.roles.discipline].includes(session?.role); }
function canEdit(session){ return session?.role === APP.roles.ceo; }
function canDelete(session){ return session?.role === APP.roles.ceo; }
function canViewTarget(session, targetEmployeeId){
  if(!session) return false;
  if(session.role === APP.roles.ceo || session.role === APP.roles.discipline) return true;
  return normalizeId(session.employeeId) === normalizeId(targetEmployeeId);
}
function isExpired(w){
  if(w.expiresMode !== APP.expiresMode.expiresOn) return false;
  if(!w.expiresOn) return false;
  return w.expiresOn < todayISO();
}
function timestampToText(v){
  if(!v) return "";
  if(typeof v.toDate === "function") return v.toDate().toLocaleString();
  if(typeof v === "string") return v;
  return "";
}
function toast(t, m){
  $("toastT").innerText = t || "Notice";
  $("toastM").innerText = m || "";
  $("toast").classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3300);
}
function esc(s){
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function logAction(action, targetEmployeeId = "", writeUpId = "", details = ""){
  try{
    await addDoc(collection(db, APP.collections.audit), {
      timestamp: serverTimestamp(),
      actorId: ME?.employeeId || "",
      actorRole: ME?.role || "",
      action,
      targetEmployeeId,
      writeUpId,
      details: String(details || "").slice(0, 2000),
      userAgent: navigator.userAgent || ""
    });
  }catch(err){
    console.warn("Audit log failed", err);
  }
}

async function ensureSettings(){
  const settingsRef = doc(db, APP.collections.settings, "app");
  const snap = await getDoc(settingsRef);
  if(!snap.exists()){
    await setDoc(settingsRef, {
      title: APP.title,
      collectionsCreated: true,
      roles: APP.roles,
      expiresModes: APP.expiresMode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

async function hasAnyEmployees(){
  const q = query(collection(db, APP.collections.employees), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

async function setupFirstCeo(){
  const employeeId = normalizeId($("setupId").value);
  const employeeName = normalizeText($("setupName").value);
  if(!employeeId) return toast("Setup blocked", "Employee ID is required.");
  if(!employeeName) return toast("Setup blocked", "Employee Name is required.");

  const exists = await hasAnyEmployees();
  if(exists){
    $("setupMsg").innerText = "Setup is locked because employee records already exist.";
    toast("Setup locked", "An employee record already exists.");
    await checkSetupState();
    return;
  }

  await setDoc(doc(db, APP.collections.employees, employeeId), {
    employeeId,
    employeeName,
    role: APP.roles.ceo,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: "initial-setup"
  });

  await addDoc(collection(db, APP.collections.audit), {
    timestamp: serverTimestamp(),
    actorId: employeeId,
    actorRole: APP.roles.ceo,
    action: "INITIAL_CEO_CREATED",
    targetEmployeeId: employeeId,
    writeUpId: "",
    details: "Initial CEO account created from setup panel.",
    userAgent: navigator.userAgent || ""
  });

  $("setupMsg").innerText = "CEO account created. You may now sign in.";
  toast("Setup complete", "Initial CEO account created.");
  await checkSetupState();
}

async function checkSetupState(){
  try{
    await ensureSettings();
    const exists = await hasAnyEmployees();
    $("setupNotice").classList.toggle("hidden", exists);
    $("setupCard").classList.toggle("hidden", exists);
  }catch(err){
    toast("Firestore error", err.message || "Could not check setup state.");
  }
}

async function getEmployeeById(employeeId){
  const id = normalizeId(employeeId);
  if(!id) return null;
  const snap = await getDoc(doc(db, APP.collections.employees, id));
  if(!snap.exists()) return null;
  const data = snap.data();
  return {
    employeeId: normalizeId(data.employeeId || id),
    name: normalizeText(data.employeeName || data.name),
    role: normalizeText(data.role),
    active: data.active === true
  };
}

function saveSession(emp){
  const session = {
    token: crypto.randomUUID(),
    employeeId: emp.employeeId,
    name: emp.name,
    role: emp.role,
    createdAt: new Date().toISOString()
  };
  localStorage.setItem(APP.sessionKey, JSON.stringify(session));
  TOKEN = session.token;
  ME = session;
  CAPS = { canCreate: canCreate(ME), canEdit: canEdit(ME), canDelete: canDelete(ME) };
}
function loadSession(){
  try{
    const raw = localStorage.getItem(APP.sessionKey);
    if(!raw) return false;
    const session = JSON.parse(raw);
    if(!session?.employeeId || !session?.role) return false;
    TOKEN = session.token;
    ME = session;
    CAPS = { canCreate: canCreate(ME), canEdit: canEdit(ME), canDelete: canDelete(ME) };
    return true;
  }catch{
    return false;
  }
}
function clearSession(){
  localStorage.removeItem(APP.sessionKey);
  TOKEN = "";
  ME = null;
  CAPS = { canCreate: false, canEdit: false, canDelete: false };
}

function setWho(){
  $("whoText").innerText = ME ? `${ME.role} • ${ME.name || ME.employeeId}` : "Not signed in";
}
function showLogin(){
  $("loginCard").classList.remove("hidden");
  $("createCard").classList.add("hidden");
  $("resultsCard").classList.add("hidden");
  setWho();
}
function showApp(){
  $("loginCard").classList.add("hidden");
  $("resultsCard").classList.remove("hidden");
  $("createCard").classList.toggle("hidden", !CAPS.canCreate);
  $("readonlyNote").innerText = CAPS.canEdit ? "CEO access: edit and delete are available." : "Edit and delete are restricted to CEO.";
  setWho();
}
function clearCreate(){
  $("targetEmpId").value = "";
  $("targetName").value = "";
  $("writeUpDate").value = todayISO();
  $("expiresMode").value = APP.expiresMode.never;
  $("expiresOn").value = "";
  $("expiresOn").disabled = true;
  $("reason").value = "";
  $("createMsg").innerText = "";
}
function setExpiresUi(){
  const enabled = $("expiresMode").value === APP.expiresMode.expiresOn;
  $("expiresOn").disabled = !enabled;
  if(!enabled) $("expiresOn").value = "";
}

async function doLogin(){
  const id = normalizeId($("empId").value);
  $("loginMsg").innerText = "";
  if(!id) return toast("Sign in blocked", "Employee ID is required.");
  try{
    const emp = await getEmployeeById(id);
    if(!emp){
      $("loginMsg").innerText = "Employee ID not found.";
      await addDoc(collection(db, APP.collections.audit), { timestamp: serverTimestamp(), actorId: id, actorRole: "", action: "LOGIN_FAIL", targetEmployeeId: "", writeUpId: "", details: "Employee ID not found", userAgent: navigator.userAgent || "" });
      return toast("Sign in failed", "Employee ID not found.");
    }
    if(!emp.active){
      $("loginMsg").innerText = "Account inactive.";
      return toast("Sign in failed", "Account inactive.");
    }
    if(!isKnownRole(emp.role)){
      $("loginMsg").innerText = "Account role misconfigured.";
      return toast("Sign in failed", "Account role misconfigured.");
    }
    saveSession(emp);
    await logAction("LOGIN_SUCCESS", emp.employeeId, "", "Session created");
    showApp();
    clearCreate();
    clearDetail();
    await loadList(true);
    toast("Signed in", "Access granted.");
  }catch(err){
    toast("Sign in failed", err.message || "Request failed.");
  }
}
function doLogout(){
  clearSession();
  LAST = [];
  SELECTED = null;
  $("empId").value = "";
  $("list").innerHTML = "";
  $("diag").innerText = "";
  clearDetail();
  showLogin();
  toast("Signed out", "Session ended.");
}

function requireSession(){
  if(!ME) throw new Error("Session expired. Please sign in again.");
  return ME;
}
function normalizeWriteup(docSnap){
  const data = docSnap.data();
  const w = {
    writeUpId: data.writeUpId || docSnap.id,
    employeeId: data.employeeId || "",
    employeeName: data.employeeName || "",
    writeUpDate: data.writeUpDate || "",
    reason: data.reason || "",
    expiresMode: data.expiresMode || APP.expiresMode.never,
    expiresOn: data.expiresOn || "",
    createdById: data.createdById || "",
    createdAt: timestampToText(data.createdAt),
    updatedAt: timestampToText(data.updatedAt)
  };
  w.expired = isExpired(w);
  return w;
}
async function fetchAllWriteups(){
  const snap = await getDocs(query(collection(db, APP.collections.writeups), orderBy("createdAt", "desc")));
  const out = [];
  snap.forEach(d => {
    const w = normalizeWriteup(d);
    if(canViewTarget(ME, w.employeeId)) out.push(w);
  });
  return out;
}
async function loadList(showToast = false){
  requireSession();
  $("diag").innerText = "Loading write-ups...";
  try{
    LAST = await fetchAllWriteups();
    $("diag").innerText = `Loaded ${LAST.length} write-up(s).`;
    renderList(LAST);
    if(LAST.length) await selectItem(LAST[0].writeUpId);
    else clearDetail();
    await logAction("WRITEUP_VIEW", "", "", "Listed write-ups");
    if(showToast) toast("Write-ups", "List loaded.");
  }catch(err){
    $("diag").innerText = err.message || "Failed to load write-ups.";
    toast("Error", $("diag").innerText);
  }
}
function renderList(items){
  const wrap = $("list");
  wrap.innerHTML = "";
  if(!items.length){
    wrap.innerHTML = '<p class="muted">No write-ups found.</p>';
    return;
  }
  for(const w of items){
    const expText = w.expiresMode === APP.expiresMode.never ? "Never expires" : `Expires ${w.expiresOn || "—"}`;
    const statusClass = w.expired ? "bad" : "ok";
    const statusText = w.expired ? "Expired" : "Active";
    wrap.insertAdjacentHTML("beforeend", `
      <button class="linkBtn" type="button" data-id="${esc(w.writeUpId)}">
        <div class="result-line"><strong>${esc(w.employeeName || "—")} <span>(${esc(w.employeeId || "—")})</span></strong><em class="status ${statusClass}">${statusText}</em></div>
        <p>Date: ${esc(w.writeUpDate || "—")} • ${esc(expText)}</p>
      </button>
    `);
  }
}
async function getWriteupById(writeUpId){
  const snap = await getDoc(doc(db, APP.collections.writeups, writeUpId));
  if(!snap.exists()) throw new Error("WriteUp not found.");
  const w = normalizeWriteup(snap);
  if(!canViewTarget(ME, w.employeeId)) throw new Error("Insufficient permissions.");
  return w;
}
async function selectItem(writeUpId){
  try{
    SELECTED = await getWriteupById(writeUpId);
    renderDetail(SELECTED);
    await logAction("WRITEUP_VIEW", SELECTED.employeeId, SELECTED.writeUpId, "Viewed write-up detail");
  }catch(err){
    toast("Error", err.message || "Failed to load write-up.");
  }
}
function clearDetail(){
  SELECTED = null;
  $("detailMeta").innerText = "";
  $("dEmp").innerText = "—";
  $("dDate").innerText = "—";
  $("dId").innerText = "—";
  $("dExpires").innerText = "—";
  $("dCreatedBy").innerText = "—";
  $("dReason").value = "";
  $("dExpiredTag").className = "tag";
  $("dExpiredTag").innerText = "—";
  $("editBtn").classList.add("hidden");
  $("deleteBtn").classList.add("hidden");
  closeEdit();
}
function renderDetail(w){
  $("detailMeta").innerText = `Created by ${w.createdById || "—"} • Created at ${w.createdAt || "—"}`;
  $("dEmp").innerText = `${w.employeeName || "—"} (${w.employeeId || "—"})`;
  $("dDate").innerText = w.writeUpDate || "—";
  $("dId").innerText = w.writeUpId || "—";
  $("dExpires").innerText = w.expiresMode === APP.expiresMode.never ? "Expires: Never" : `Expires: ${w.expiresOn || "—"}`;
  $("dCreatedBy").innerText = `Creator: ${w.createdById || "—"}`;
  $("dReason").value = w.reason || "";
  $("dExpiredTag").className = `tag ${w.expired ? "bad" : "ok"}`;
  $("dExpiredTag").innerText = w.expired ? "Expired" : "Active";
  $("editBtn").classList.toggle("hidden", !CAPS.canEdit);
  $("deleteBtn").classList.toggle("hidden", !CAPS.canDelete);
  closeEdit();
}

async function doCreate(){
  requireSession();
  if(!canCreate(ME)) return toast("Create blocked", "Insufficient permissions.");
  const payload = {
    employeeId: normalizeId($("targetEmpId").value),
    employeeName: normalizeText($("targetName").value),
    writeUpDate: $("writeUpDate").value,
    reason: normalizeText($("reason").value),
    expiresMode: $("expiresMode").value,
    expiresOn: $("expiresOn").value
  };
  if(!payload.employeeId) return toast("Create blocked", "Employee ID is required.");
  if(!payload.employeeName) return toast("Create blocked", "Employee Name is required.");
  if(!payload.writeUpDate) return toast("Create blocked", "Write-Up Date is required.");
  if(!payload.reason) return toast("Create blocked", "Reason is required.");
  if(payload.expiresMode === APP.expiresMode.expiresOn && !payload.expiresOn) return toast("Create blocked", "Expires on date is required.");

  const target = await getEmployeeById(payload.employeeId);
  if(!target) return toast("Create blocked", "Target Employee ID was not found in employees.");

  const writeUpId = newId("WU");
  const btn = $("createBtn");
  btn.disabled = true;
  btn.innerText = "Creating...";
  try{
    await setDoc(doc(db, APP.collections.writeups, writeUpId), {
      writeUpId,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      writeUpDate: payload.writeUpDate,
      reason: payload.reason,
      expiresMode: payload.expiresMode,
      expiresOn: payload.expiresMode === APP.expiresMode.expiresOn ? payload.expiresOn : "",
      createdById: ME.employeeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await logAction("WRITEUP_CREATE", payload.employeeId, writeUpId, "Created write-up");
    $("createMsg").innerText = `Created: ${writeUpId}`;
    toast("Write-up created", `Saved as ${writeUpId}`);
    await loadList(false);
  }catch(err){
    toast("Create failed", err.message || "Request failed.");
  }finally{
    btn.disabled = false;
    btn.innerText = "Create write-up";
  }
}
function openEdit(){
  if(!CAPS.canEdit || !SELECTED) return toast("Edit blocked", "Only CEO can edit write-ups.");
  $("editDivider").classList.remove("hidden");
  $("editPanel").classList.remove("hidden");
  $("eEmpId").value = SELECTED.employeeId || "";
  $("eName").value = SELECTED.employeeName || "";
  $("eDate").value = SELECTED.writeUpDate || "";
  $("eExpiresMode").value = SELECTED.expiresMode || APP.expiresMode.never;
  $("eExpiresOn").value = SELECTED.expiresMode === APP.expiresMode.expiresOn ? SELECTED.expiresOn || "" : "";
  $("eReason").value = SELECTED.reason || "";
}
function closeEdit(){
  $("editDivider").classList.add("hidden");
  $("editPanel").classList.add("hidden");
  $("editMsg").innerText = "";
}
async function saveEdit(){
  if(!CAPS.canEdit || !SELECTED) return;
  const payload = {
    employeeId: normalizeId($("eEmpId").value),
    employeeName: normalizeText($("eName").value),
    writeUpDate: $("eDate").value,
    expiresMode: $("eExpiresMode").value,
    expiresOn: $("eExpiresOn").value,
    reason: normalizeText($("eReason").value)
  };
  if(!payload.employeeId) return toast("Save blocked", "Employee ID is required.");
  if(!payload.employeeName) return toast("Save blocked", "Employee Name is required.");
  if(!payload.writeUpDate) return toast("Save blocked", "Write-Up Date is required.");
  if(!payload.reason) return toast("Save blocked", "Reason is required.");
  if(payload.expiresMode === APP.expiresMode.expiresOn && !payload.expiresOn) return toast("Save blocked", "Expires On is required when ExpiresOn.");
  const target = await getEmployeeById(payload.employeeId);
  if(!target) return toast("Save blocked", "Target Employee ID was not found in employees.");

  const btn = $("saveEditBtn");
  btn.disabled = true;
  btn.innerText = "Saving...";
  try{
    await updateDoc(doc(db, APP.collections.writeups, SELECTED.writeUpId), {
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      writeUpDate: payload.writeUpDate,
      expiresMode: payload.expiresMode,
      expiresOn: payload.expiresMode === APP.expiresMode.expiresOn ? payload.expiresOn : "",
      reason: payload.reason,
      updatedAt: serverTimestamp(),
      updatedById: ME.employeeId
    });
    await logAction("WRITEUP_EDIT", payload.employeeId, SELECTED.writeUpId, "Updated write-up");
    toast("Saved", "Write-up updated.");
    closeEdit();
    await loadList(false);
  }catch(err){
    toast("Save failed", err.message || "Request failed.");
  }finally{
    btn.disabled = false;
    btn.innerText = "Save changes";
  }
}
async function doDelete(){
  if(!CAPS.canDelete || !SELECTED) return toast("Delete blocked", "Only CEO can delete write-ups.");
  const ok = confirm(`Delete this write-up?\n\nThis action cannot be undone.\n\nWriteUp ID: ${SELECTED.writeUpId}`);
  if(!ok) return;
  const id = SELECTED.writeUpId;
  try{
    await deleteDoc(doc(db, APP.collections.writeups, id));
    await logAction("WRITEUP_DELETE", SELECTED.employeeId, id, "Deleted write-up");
    toast("Deleted", "Write-up removed.");
    await loadList(false);
  }catch(err){
    toast("Delete failed", err.message || "Request failed.");
  }
}
async function doSearch(){
  requireSession();
  const employeeId = normalizeId($("searchEmpId").value);
  const employeeName = normalizeText($("searchName").value).toLowerCase();
  const writeUpDate = $("searchDate").value;
  if(!employeeId && !employeeName && !writeUpDate) return toast("Search blocked", "Provide at least one search field.");
  if(ME.role === APP.roles.employee && employeeId && employeeId !== ME.employeeId) return toast("Search blocked", "Employees may only search their own Employee ID.");

  $("diag").innerText = "Searching...";
  try{
    const all = await fetchAllWriteups();
    LAST = all.filter(w => {
      if(employeeId && w.employeeId !== employeeId) return false;
      if(employeeName && !String(w.employeeName || "").toLowerCase().includes(employeeName)) return false;
      if(writeUpDate && w.writeUpDate !== writeUpDate) return false;
      return true;
    });
    $("diag").innerText = `Found ${LAST.length} write-up(s).`;
    renderList(LAST);
    if(LAST.length) await selectItem(LAST[0].writeUpId);
    else clearDetail();
    await logAction("SEARCH", employeeId || "", "", JSON.stringify({ employeeId: !!employeeId, employeeName: !!employeeName, writeUpDate: !!writeUpDate }));
    toast("Search complete", "Results updated.");
  }catch(err){
    $("diag").innerText = err.message || "Search failed.";
    toast("Search failed", $("diag").innerText);
  }
}

$("loginBtn").addEventListener("click", doLogin);
$("empId").addEventListener("keydown", e => { if(e.key === "Enter") doLogin(); });
$("setupBtn").addEventListener("click", setupFirstCeo);
$("logoutBtn1").addEventListener("click", doLogout);
$("logoutBtn2").addEventListener("click", doLogout);
$("expiresMode").addEventListener("change", setExpiresUi);
$("clearCreateBtn").addEventListener("click", clearCreate);
$("createBtn").addEventListener("click", doCreate);
$("refreshBtn").addEventListener("click", () => loadList(true));
$("searchBtn").addEventListener("click", doSearch);
$("editBtn").addEventListener("click", openEdit);
$("cancelEditBtn").addEventListener("click", closeEdit);
$("saveEditBtn").addEventListener("click", saveEdit);
$("deleteBtn").addEventListener("click", doDelete);
$("list").addEventListener("click", e => {
  const btn = e.target.closest("button[data-id]");
  if(btn) selectItem(btn.dataset.id);
});

(async function init(){
  showLogin();
  clearDetail();
  clearCreate();
  await checkSetupState();
  if(loadSession()){
    const fresh = await getEmployeeById(ME.employeeId);
    if(fresh && fresh.active && fresh.role === ME.role){
      showApp();
      await loadList(false);
    }else{
      clearSession();
      showLogin();
    }
  }
})();
