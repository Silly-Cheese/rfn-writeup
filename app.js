import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

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
  sessionKey: "rfn_writeups_session_v2",
  oneTimePassword: "RFN2026",
  roles: { discipline: "DisciplinePerms", ceo: "CEO", employee: "Employee" },
  statuses: { active: "Active", inactive: "Inactive", terminated: "Terminated" },
  expiresMode: { never: "Never", expiresOn: "ExpiresOn" },
  collections: { employees: "employees", writeups: "writeups", audit: "auditLogs", settings: "systemSettings" }
};

let TOKEN = "";
let ME = null;
let CAPS = { canCreate: false, canEdit: false, canDelete: false, canManageEmployees: false };
let LAST = [];
let SELECTED = null;
let PASSWORD_SETUP_EMPLOYEE = null;
const $ = (id) => document.getElementById(id);

function todayISO(){ return new Date().toISOString().slice(0, 10); }
function newId(prefix){ return `${prefix}-${new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace("T", "-").slice(0, 15)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; }
function normalizeId(v){ return String(v || "").trim(); }
function normalizeText(v){ return String(v || "").trim(); }
function fakeEmailFor(id){ return `${normalizeId(id).toLowerCase().replace(/[^a-z0-9._-]/g, "") || "employee"}@rfn.local`; }
function isKnownRole(role){ return Object.values(APP.roles).includes(role); }
function canCreate(session){ return [APP.roles.ceo, APP.roles.discipline].includes(session?.role); }
function canEdit(session){ return session?.role === APP.roles.ceo; }
function canDelete(session){ return session?.role === APP.roles.ceo; }
function canManageEmployees(session){ return session?.role === APP.roles.ceo; }
function canViewTarget(session, targetEmployeeId){ if(!session) return false; if(session.role === APP.roles.ceo || session.role === APP.roles.discipline) return true; return normalizeId(session.employeeId) === normalizeId(targetEmployeeId); }
function isExpired(w){ return w.expiresMode === APP.expiresMode.expiresOn && !!w.expiresOn && w.expiresOn < todayISO(); }
function timestampToText(v){ if(!v) return ""; if(typeof v.toDate === "function") return v.toDate().toLocaleString(); if(typeof v === "string") return v; return ""; }
function statusToActive(status){ return status === APP.statuses.active; }
function activeToStatus(data){ if(data.status) return data.status; return data.active === true ? APP.statuses.active : APP.statuses.inactive; }
async function sha256(text){ const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function toast(t, m){ $("toastT").innerText = t || "Notice"; $("toastM").innerText = m || ""; $("toast").classList.add("show"); clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3300); }
function esc(s){ return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

async function logAction(action, targetEmployeeId = "", writeUpId = "", details = ""){
  try{ await addDoc(collection(db, APP.collections.audit), { timestamp: serverTimestamp(), actorId: ME?.employeeId || "", actorRole: ME?.role || "", action, targetEmployeeId, writeUpId, details: String(details || "").slice(0, 2000), userAgent: navigator.userAgent || "" }); }catch(err){ console.warn("Audit log failed", err); }
}
async function ensureSettings(){
  const ref = doc(db, APP.collections.settings, "app");
  const snap = await getDoc(ref);
  if(!snap.exists()) await setDoc(ref, { title: APP.title, collectionsCreated: true, roles: APP.roles, statuses: APP.statuses, expiresModes: APP.expiresMode, loginMode: "employeeId-password-shared-otp", oneTimePasswordHint: "Configured in app.js", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
async function hasAnyEmployees(){ const snap = await getDocs(query(collection(db, APP.collections.employees), limit(1))); return !snap.empty; }

async function setupFirstCeo(){
  const employeeId = normalizeId($("setupId").value);
  const employeeName = normalizeText($("setupName").value);
  const fakeEmail = normalizeText($("setupEmail").value) || fakeEmailFor(employeeId);
  if(!employeeId) return toast("Setup blocked", "Employee ID is required.");
  if(!employeeName) return toast("Setup blocked", "Employee Name is required.");
  if(await hasAnyEmployees()){ $("setupMsg").innerText = "Setup is locked because employee records already exist."; toast("Setup locked", "An employee record already exists."); await checkSetupState(); return; }
  await setDoc(doc(db, APP.collections.employees, employeeId), { employeeId, employeeName, fakeEmail, role: APP.roles.ceo, status: APP.statuses.active, active: true, mustChangePassword: true, passwordHash: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: "initial-setup" });
  await addDoc(collection(db, APP.collections.audit), { timestamp: serverTimestamp(), actorId: employeeId, actorRole: APP.roles.ceo, action: "INITIAL_CEO_CREATED", targetEmployeeId: employeeId, writeUpId: "", details: "Initial CEO account created. Permanent password still required.", userAgent: navigator.userAgent || "" });
  $("setupMsg").innerText = `CEO created. Sign in with Employee ID and one-time password: ${APP.oneTimePassword}`;
  toast("Setup complete", "Initial CEO account created.");
  await checkSetupState();
}
async function checkSetupState(){
  try{ await ensureSettings(); const exists = await hasAnyEmployees(); $("setupNotice").classList.toggle("hidden", exists); $("setupCard").classList.toggle("hidden", exists); }catch(err){ toast("Firestore error", err.message || "Could not check setup state."); }
}
async function getEmployeeById(employeeId){
  const id = normalizeId(employeeId); if(!id) return null;
  const snap = await getDoc(doc(db, APP.collections.employees, id)); if(!snap.exists()) return null;
  const data = snap.data();
  return { employeeId: normalizeId(data.employeeId || id), name: normalizeText(data.employeeName || data.name), fakeEmail: normalizeText(data.fakeEmail), role: normalizeText(data.role), status: activeToStatus(data), active: data.active === true && activeToStatus(data) === APP.statuses.active, mustChangePassword: data.mustChangePassword !== false || !data.passwordHash, passwordHash: data.passwordHash || "" };
}
function saveSession(emp){
  const session = { token: crypto.randomUUID(), employeeId: emp.employeeId, name: emp.name, fakeEmail: emp.fakeEmail || "", role: emp.role, status: emp.status, createdAt: new Date().toISOString() };
  localStorage.setItem(APP.sessionKey, JSON.stringify(session)); TOKEN = session.token; ME = session;
  CAPS = { canCreate: canCreate(ME), canEdit: canEdit(ME), canDelete: canDelete(ME), canManageEmployees: canManageEmployees(ME) };
}
function loadSession(){
  try{ const raw = localStorage.getItem(APP.sessionKey); if(!raw) return false; const session = JSON.parse(raw); if(!session?.employeeId || !session?.role) return false; TOKEN = session.token; ME = session; CAPS = { canCreate: canCreate(ME), canEdit: canEdit(ME), canDelete: canDelete(ME), canManageEmployees: canManageEmployees(ME) }; return true; }catch{ return false; }
}
function clearSession(){ localStorage.removeItem(APP.sessionKey); TOKEN = ""; ME = null; CAPS = { canCreate:false, canEdit:false, canDelete:false, canManageEmployees:false }; }
function setWho(){ $("whoText").innerText = ME ? `${ME.role} • ${ME.name || ME.employeeId}` : "Not signed in"; }
function showLogin(){ $("loginCard").classList.remove("hidden"); $("createCard").classList.add("hidden"); $("employeeAdminCard").classList.add("hidden"); $("resultsCard").classList.add("hidden"); setWho(); }
function showApp(){
  $("loginCard").classList.add("hidden"); $("resultsCard").classList.remove("hidden");
  $("createCard").classList.toggle("hidden", !CAPS.canCreate);
  $("employeeAdminCard").classList.toggle("hidden", !CAPS.canManageEmployees);
  $("readonlyNote").innerText = CAPS.canEdit ? "CEO access: edit and delete are available." : "Edit and delete are restricted to CEO.";
  setWho();
}
function openPasswordModal(emp){ PASSWORD_SETUP_EMPLOYEE = emp; $("newPass").value = ""; $("confirmPass").value = ""; $("passwordMsg").innerText = ""; $("passwordModal").classList.remove("hidden"); }
function closePasswordModal(){ PASSWORD_SETUP_EMPLOYEE = null; $("passwordModal").classList.add("hidden"); }
async function finishLogin(emp){ saveSession(emp); await logAction("LOGIN_SUCCESS", emp.employeeId, "", "Session created"); showApp(); clearCreate(); clearDetail(); await loadList(true); if(CAPS.canManageEmployees) await loadEmployees(); toast("Signed in", "Access granted."); }
async function setPermanentPassword(){
  if(!PASSWORD_SETUP_EMPLOYEE) return;
  const p1 = $("newPass").value; const p2 = $("confirmPass").value;
  if(p1.length < 6){ $("passwordMsg").innerText = "Password must be at least 6 characters."; return; }
  if(p1 !== p2){ $("passwordMsg").innerText = "Passwords do not match."; return; }
  const passwordHash = await sha256(p1);
  await updateDoc(doc(db, APP.collections.employees, PASSWORD_SETUP_EMPLOYEE.employeeId), { passwordHash, mustChangePassword: false, updatedAt: serverTimestamp(), passwordSetAt: serverTimestamp() });
  await addDoc(collection(db, APP.collections.audit), { timestamp: serverTimestamp(), actorId: PASSWORD_SETUP_EMPLOYEE.employeeId, actorRole: PASSWORD_SETUP_EMPLOYEE.role, action: "PASSWORD_CREATED", targetEmployeeId: PASSWORD_SETUP_EMPLOYEE.employeeId, writeUpId: "", details: "Permanent password created after one-time password login.", userAgent: navigator.userAgent || "" });
  const emp = await getEmployeeById(PASSWORD_SETUP_EMPLOYEE.employeeId);
  closePasswordModal();
  await finishLogin(emp);
}
async function doLogin(){
  const id = normalizeId($("empId").value); const pass = $("loginPass").value;
  $("loginMsg").innerText = "";
  if(!id) return toast("Sign in blocked", "Employee ID is required.");
  if(!pass) return toast("Sign in blocked", "Password is required.");
  try{
    const emp = await getEmployeeById(id);
    if(!emp){ $("loginMsg").innerText = "Employee ID not found."; await addDoc(collection(db, APP.collections.audit), { timestamp: serverTimestamp(), actorId: id, actorRole: "", action: "LOGIN_FAIL", targetEmployeeId: "", writeUpId: "", details: "Employee ID not found", userAgent: navigator.userAgent || "" }); return toast("Sign in failed", "Employee ID not found."); }
    if(emp.status === APP.statuses.terminated) return toast("Sign in failed", "Account terminated.");
    if(emp.status === APP.statuses.inactive || !emp.active) return toast("Sign in failed", "Account inactive.");
    if(!isKnownRole(emp.role)) return toast("Sign in failed", "Account role misconfigured.");
    if(emp.mustChangePassword){
      if(pass !== APP.oneTimePassword) return toast("Sign in failed", "Use the shared one-time password for first sign-in.");
      openPasswordModal(emp); return;
    }
    const hash = await sha256(pass);
    if(hash !== emp.passwordHash){ await logAction("LOGIN_FAIL", emp.employeeId, "", "Incorrect password"); return toast("Sign in failed", "Incorrect password."); }
    await finishLogin(emp);
  }catch(err){ toast("Sign in failed", err.message || "Request failed."); }
}
function doLogout(){ clearSession(); LAST=[]; SELECTED=null; $("empId").value=""; $("loginPass").value=""; $("list").innerHTML=""; $("diag").innerText=""; clearDetail(); showLogin(); toast("Signed out", "Session ended."); }
function requireSession(){ if(!ME) throw new Error("Session expired. Please sign in again."); return ME; }

function clearCreate(){ $("targetEmpId").value=""; $("targetName").value=""; $("writeUpDate").value=todayISO(); $("expiresMode").value=APP.expiresMode.never; $("expiresOn").value=""; $("expiresOn").disabled=true; $("reason").value=""; $("createMsg").innerText=""; }
function setExpiresUi(){ const enabled = $("expiresMode").value === APP.expiresMode.expiresOn; $("expiresOn").disabled = !enabled; if(!enabled) $("expiresOn").value=""; }
function normalizeWriteup(docSnap){ const d = docSnap.data(); const w = { writeUpId:d.writeUpId || docSnap.id, employeeId:d.employeeId || "", employeeName:d.employeeName || "", writeUpDate:d.writeUpDate || "", reason:d.reason || "", expiresMode:d.expiresMode || APP.expiresMode.never, expiresOn:d.expiresOn || "", createdById:d.createdById || "", createdAt:timestampToText(d.createdAt), updatedAt:timestampToText(d.updatedAt) }; w.expired = isExpired(w); return w; }
async function fetchAllWriteups(){ const snap = await getDocs(query(collection(db, APP.collections.writeups), orderBy("createdAt", "desc"))); const out=[]; snap.forEach(d => { const w=normalizeWriteup(d); if(canViewTarget(ME,w.employeeId)) out.push(w); }); return out; }
async function loadList(showToast=false){ requireSession(); $("diag").innerText="Loading write-ups..."; try{ LAST=await fetchAllWriteups(); $("diag").innerText=`Loaded ${LAST.length} write-up(s).`; renderList(LAST); if(LAST.length) await selectItem(LAST[0].writeUpId); else clearDetail(); await logAction("WRITEUP_VIEW", "", "", "Listed write-ups"); if(showToast) toast("Write-ups", "List loaded."); }catch(err){ $("diag").innerText=err.message || "Failed to load write-ups."; toast("Error", $("diag").innerText); } }
function renderList(items){ const wrap=$("list"); wrap.innerHTML=""; if(!items.length){ wrap.innerHTML='<p class="muted">No write-ups found.</p>'; return; } for(const w of items){ const expText = w.expiresMode === APP.expiresMode.never ? "Never expires" : `Expires ${w.expiresOn || "—"}`; wrap.insertAdjacentHTML("beforeend", `<button class="linkBtn" type="button" data-id="${esc(w.writeUpId)}"><div class="result-line"><strong>${esc(w.employeeName || "—")} <span>(${esc(w.employeeId || "—")})</span></strong><em class="status ${w.expired ? "bad" : "ok"}">${w.expired ? "Expired" : "Active"}</em></div><p>Date: ${esc(w.writeUpDate || "—")} • ${esc(expText)}</p></button>`); } }
async function getWriteupById(writeUpId){ const snap = await getDoc(doc(db, APP.collections.writeups, writeUpId)); if(!snap.exists()) throw new Error("WriteUp not found."); const w=normalizeWriteup(snap); if(!canViewTarget(ME,w.employeeId)) throw new Error("Insufficient permissions."); return w; }
async function selectItem(writeUpId){ try{ SELECTED=await getWriteupById(writeUpId); renderDetail(SELECTED); await logAction("WRITEUP_VIEW", SELECTED.employeeId, SELECTED.writeUpId, "Viewed write-up detail"); }catch(err){ toast("Error", err.message || "Failed to load write-up."); } }
function clearDetail(){ SELECTED=null; $("detailMeta").innerText=""; $("dEmp").innerText="—"; $("dDate").innerText="—"; $("dId").innerText="—"; $("dExpires").innerText="—"; $("dCreatedBy").innerText="—"; $("dReason").value=""; $("dExpiredTag").className="tag"; $("dExpiredTag").innerText="—"; $("editBtn").classList.add("hidden"); $("deleteBtn").classList.add("hidden"); closeEdit(); }
function renderDetail(w){ $("detailMeta").innerText=`Created by ${w.createdById || "—"} • Created at ${w.createdAt || "—"}`; $("dEmp").innerText=`${w.employeeName || "—"} (${w.employeeId || "—"})`; $("dDate").innerText=w.writeUpDate || "—"; $("dId").innerText=w.writeUpId || "—"; $("dExpires").innerText=w.expiresMode === APP.expiresMode.never ? "Expires: Never" : `Expires: ${w.expiresOn || "—"}`; $("dCreatedBy").innerText=`Creator: ${w.createdById || "—"}`; $("dReason").value=w.reason || ""; $("dExpiredTag").className=`tag ${w.expired ? "bad" : "ok"}`; $("dExpiredTag").innerText=w.expired ? "Expired" : "Active"; $("editBtn").classList.toggle("hidden", !CAPS.canEdit); $("deleteBtn").classList.toggle("hidden", !CAPS.canDelete); closeEdit(); }
async function doCreate(){ requireSession(); if(!canCreate(ME)) return toast("Create blocked", "Insufficient permissions."); const payload={ employeeId:normalizeId($("targetEmpId").value), employeeName:normalizeText($("targetName").value), writeUpDate:$("writeUpDate").value, reason:normalizeText($("reason").value), expiresMode:$("expiresMode").value, expiresOn:$("expiresOn").value }; if(!payload.employeeId || !payload.employeeName || !payload.writeUpDate || !payload.reason) return toast("Create blocked", "Employee ID, name, date, and reason are required."); if(payload.expiresMode === APP.expiresMode.expiresOn && !payload.expiresOn) return toast("Create blocked", "Expires on date is required."); const target=await getEmployeeById(payload.employeeId); if(!target) return toast("Create blocked", "Target Employee ID was not found in employees."); const writeUpId=newId("WU"); const btn=$("createBtn"); btn.disabled=true; btn.innerText="Creating..."; try{ await setDoc(doc(db, APP.collections.writeups, writeUpId), { writeUpId, employeeId:payload.employeeId, employeeName:payload.employeeName, writeUpDate:payload.writeUpDate, reason:payload.reason, expiresMode:payload.expiresMode, expiresOn:payload.expiresMode === APP.expiresMode.expiresOn ? payload.expiresOn : "", createdById:ME.employeeId, createdAt:serverTimestamp(), updatedAt:serverTimestamp() }); await logAction("WRITEUP_CREATE", payload.employeeId, writeUpId, "Created write-up"); $("createMsg").innerText=`Created: ${writeUpId}`; toast("Write-up created", `Saved as ${writeUpId}`); await loadList(false); }catch(err){ toast("Create failed", err.message || "Request failed."); }finally{ btn.disabled=false; btn.innerText="Create write-up"; } }
function openEdit(){ if(!CAPS.canEdit || !SELECTED) return toast("Edit blocked", "Only CEO can edit write-ups."); $("editDivider").classList.remove("hidden"); $("editPanel").classList.remove("hidden"); $("eEmpId").value=SELECTED.employeeId || ""; $("eName").value=SELECTED.employeeName || ""; $("eDate").value=SELECTED.writeUpDate || ""; $("eExpiresMode").value=SELECTED.expiresMode || APP.expiresMode.never; $("eExpiresOn").value=SELECTED.expiresMode === APP.expiresMode.expiresOn ? SELECTED.expiresOn || "" : ""; $("eReason").value=SELECTED.reason || ""; }
function closeEdit(){ $("editDivider").classList.add("hidden"); $("editPanel").classList.add("hidden"); $("editMsg").innerText=""; }
async function saveEdit(){ if(!CAPS.canEdit || !SELECTED) return; const payload={ employeeId:normalizeId($("eEmpId").value), employeeName:normalizeText($("eName").value), writeUpDate:$("eDate").value, expiresMode:$("eExpiresMode").value, expiresOn:$("eExpiresOn").value, reason:normalizeText($("eReason").value) }; if(!payload.employeeId || !payload.employeeName || !payload.writeUpDate || !payload.reason) return toast("Save blocked", "Employee ID, name, date, and reason are required."); if(payload.expiresMode === APP.expiresMode.expiresOn && !payload.expiresOn) return toast("Save blocked", "Expires On is required when ExpiresOn."); const target=await getEmployeeById(payload.employeeId); if(!target) return toast("Save blocked", "Target Employee ID was not found in employees."); const btn=$("saveEditBtn"); btn.disabled=true; btn.innerText="Saving..."; try{ await updateDoc(doc(db, APP.collections.writeups, SELECTED.writeUpId), { employeeId:payload.employeeId, employeeName:payload.employeeName, writeUpDate:payload.writeUpDate, expiresMode:payload.expiresMode, expiresOn:payload.expiresMode === APP.expiresMode.expiresOn ? payload.expiresOn : "", reason:payload.reason, updatedAt:serverTimestamp(), updatedById:ME.employeeId }); await logAction("WRITEUP_EDIT", payload.employeeId, SELECTED.writeUpId, "Updated write-up"); toast("Saved", "Write-up updated."); closeEdit(); await loadList(false); }catch(err){ toast("Save failed", err.message || "Request failed."); }finally{ btn.disabled=false; btn.innerText="Save changes"; } }
async function doDelete(){ if(!CAPS.canDelete || !SELECTED) return toast("Delete blocked", "Only CEO can delete write-ups."); if(!confirm(`Delete this write-up?\n\nThis action cannot be undone.\n\nWriteUp ID: ${SELECTED.writeUpId}`)) return; const id=SELECTED.writeUpId; try{ await deleteDoc(doc(db, APP.collections.writeups, id)); await logAction("WRITEUP_DELETE", SELECTED.employeeId, id, "Deleted write-up"); toast("Deleted", "Write-up removed."); await loadList(false); }catch(err){ toast("Delete failed", err.message || "Request failed."); } }
async function doSearch(){ requireSession(); const employeeId=normalizeId($("searchEmpId").value); const employeeName=normalizeText($("searchName").value).toLowerCase(); const writeUpDate=$("searchDate").value; if(!employeeId && !employeeName && !writeUpDate) return toast("Search blocked", "Provide at least one search field."); if(ME.role === APP.roles.employee && employeeId && employeeId !== ME.employeeId) return toast("Search blocked", "Employees may only search their own Employee ID."); $("diag").innerText="Searching..."; try{ const all=await fetchAllWriteups(); LAST=all.filter(w => (!employeeId || w.employeeId === employeeId) && (!employeeName || String(w.employeeName || "").toLowerCase().includes(employeeName)) && (!writeUpDate || w.writeUpDate === writeUpDate)); $("diag").innerText=`Found ${LAST.length} write-up(s).`; renderList(LAST); if(LAST.length) await selectItem(LAST[0].writeUpId); else clearDetail(); await logAction("SEARCH", employeeId || "", "", JSON.stringify({ employeeId:!!employeeId, employeeName:!!employeeName, writeUpDate:!!writeUpDate })); toast("Search complete", "Results updated."); }catch(err){ $("diag").innerText=err.message || "Search failed."; toast("Search failed", $("diag").innerText); } }

function clearEmployeeForm(){ $("adminEmpId").value=""; $("adminName").value=""; $("adminEmail").value=""; $("adminRole").value=APP.roles.employee; $("adminStatus").value=APP.statuses.active; $("adminMsg").innerText=""; }
async function saveEmployee(){
  requireSession(); if(!CAPS.canManageEmployees) return toast("Blocked", "Only CEO can manage employees.");
  const employeeId=normalizeId($("adminEmpId").value), employeeName=normalizeText($("adminName").value), fakeEmail=normalizeText($("adminEmail").value) || fakeEmailFor(employeeId), role=$("adminRole").value, status=$("adminStatus").value;
  if(!employeeId || !employeeName) return toast("Employee blocked", "Employee ID and name are required.");
  if(!isKnownRole(role)) return toast("Employee blocked", "Invalid role.");
  const exists = await getEmployeeById(employeeId);
  const base = { employeeId, employeeName, fakeEmail, role, status, active: statusToActive(status), updatedAt: serverTimestamp(), updatedById: ME.employeeId };
  if(exists){ await updateDoc(doc(db, APP.collections.employees, employeeId), base); await logAction("EMPLOYEE_UPDATED", employeeId, "", `Role=${role}; Status=${status}`); }
  else{ await setDoc(doc(db, APP.collections.employees, employeeId), { ...base, mustChangePassword: true, passwordHash: "", createdAt: serverTimestamp(), createdById: ME.employeeId }); await logAction("EMPLOYEE_CREATED", employeeId, "", `Role=${role}; Status=${status}; One-time password required.`); }
  $("adminMsg").innerText = exists ? "Employee updated." : `Employee added. First login one-time password: ${APP.oneTimePassword}`;
  toast(exists ? "Employee updated" : "Employee added", exists ? "Changes saved." : "They can now sign in with the one-time password.");
  await loadEmployees();
}
async function loadEmployees(){
  if(!CAPS.canManageEmployees) return;
  const wrap=$("employeeList"); wrap.innerHTML='<p class="muted">Loading employees...</p>';
  const snap = await getDocs(query(collection(db, APP.collections.employees), orderBy("employeeName", "asc")));
  const employees=[]; snap.forEach(d => { const x=d.data(); employees.push({ employeeId:x.employeeId || d.id, employeeName:x.employeeName || x.name || "", fakeEmail:x.fakeEmail || "", role:x.role || "", status:activeToStatus(x), mustChangePassword:x.mustChangePassword !== false || !x.passwordHash }); });
  if(!employees.length){ wrap.innerHTML='<p class="muted">No employees found.</p>'; return; }
  wrap.innerHTML="";
  for(const e of employees){ wrap.insertAdjacentHTML("beforeend", `<button class="employeeItem" type="button" data-id="${esc(e.employeeId)}" data-name="${esc(e.employeeName)}" data-email="${esc(e.fakeEmail)}" data-role="${esc(e.role)}" data-status="${esc(e.status)}"><strong>${esc(e.employeeName || "—")}</strong><span>${esc(e.employeeId)} • ${esc(e.role)} • ${esc(e.status)}${e.mustChangePassword ? " • Needs password" : ""}</span><small>${esc(e.fakeEmail || "No fake email")}</small></button>`); }
}

$("loginBtn").addEventListener("click", doLogin);
$("empId").addEventListener("keydown", e => { if(e.key === "Enter") doLogin(); });
$("loginPass").addEventListener("keydown", e => { if(e.key === "Enter") doLogin(); });
$("setPasswordBtn").addEventListener("click", setPermanentPassword);
$("setupBtn").addEventListener("click", setupFirstCeo);
$("logoutBtn1").addEventListener("click", doLogout);
$("logoutBtn2").addEventListener("click", doLogout);
$("adminClearBtn").addEventListener("click", clearEmployeeForm);
$("adminSaveBtn").addEventListener("click", saveEmployee);
$("employeeRefreshBtn").addEventListener("click", loadEmployees);
$("employeeList").addEventListener("click", e => { const btn=e.target.closest("button[data-id]"); if(!btn) return; $("adminEmpId").value=btn.dataset.id; $("adminName").value=btn.dataset.name; $("adminEmail").value=btn.dataset.email; $("adminRole").value=btn.dataset.role; $("adminStatus").value=btn.dataset.status; });
$("expiresMode").addEventListener("change", setExpiresUi);
$("clearCreateBtn").addEventListener("click", clearCreate);
$("createBtn").addEventListener("click", doCreate);
$("refreshBtn").addEventListener("click", () => loadList(true));
$("searchBtn").addEventListener("click", doSearch);
$("editBtn").addEventListener("click", openEdit);
$("cancelEditBtn").addEventListener("click", closeEdit);
$("saveEditBtn").addEventListener("click", saveEdit);
$("deleteBtn").addEventListener("click", doDelete);
$("list").addEventListener("click", e => { const btn=e.target.closest("button[data-id]"); if(btn) selectItem(btn.dataset.id); });

(async function init(){
  showLogin(); clearDetail(); clearCreate(); clearEmployeeForm(); await checkSetupState();
  if(loadSession()){
    const fresh = await getEmployeeById(ME.employeeId);
    if(fresh && fresh.active && fresh.role === ME.role){ showApp(); await loadList(false); if(CAPS.canManageEmployees) await loadEmployees(); }
    else{ clearSession(); showLogin(); }
  }
})();
