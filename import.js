import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAhanBvRjSePaZpdAwQaXZhnk7zPqKB2fw",
  authDomain: "robloxianfn.firebaseapp.com",
  projectId: "robloxianfn",
  storageBucket: "robloxianfn.firebasestorage.app",
  messagingSenderId: "909261155071",
  appId: "1:909261155071:web:9d5a52c28bdae740683aca"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const SESSION_KEY = "rfn_writeups_session_v3";
const OTP = "RFN2026";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const clean = (s) => String(s || "").trim();
const keyify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fakeEmailFor = (id) => `${clean(id).toLowerCase().replace(/[^a-z0-9._-]/g, "") || "employee"}@rfn.local`;
const dateISO = (v) => {
  const raw = clean(v);
  if(!raw) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if(!Number.isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return raw;
};
const newWriteUpId = () => `WU-${new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace("T", "-").slice(0, 15)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

function session(){
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}
function isCEO(){
  const who = $("whoText")?.textContent || "";
  const s = session();
  return who.startsWith("CEO") || s?.role === "CEO";
}
function toast(t, m){
  const toast = $("toast");
  if(!toast) return alert(`${t}\n${m || ""}`);
  $("toastT").innerText = t || "Notice";
  $("toastM").innerText = m || "";
  toast.classList.add("show");
  clearTimeout(window.__importToastTimer);
  window.__importToastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function parseSheet(text){
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter(line => line.trim().length);
  if(lines.length < 2) throw new Error("Paste must include a header row and at least one data row.");
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map(h => clean(h));
  return lines.slice(1).map((line, idx) => {
    const cells = line.split(delimiter).map(c => clean(c));
    const row = { __row: idx + 2 };
    headers.forEach((h, i) => row[keyify(h)] = cells[i] || "");
    return row;
  });
}
function pick(row, names){
  for(const n of names){
    const key = keyify(n);
    if(row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}
function normalizeRole(v){
  const r = clean(v) || "Employee";
  const low = r.toLowerCase();
  if(low === "ceo") return "CEO";
  if(low.includes("discipline")) return "DisciplinePerms";
  return "Employee";
}
function normalizeStatus(v){
  const s = clean(v) || "Active";
  const low = s.toLowerCase();
  if(low.startsWith("term")) return "Terminated";
  if(low.startsWith("inact")) return "Inactive";
  return "Active";
}
function normalizeExpiresMode(v){
  const s = clean(v);
  if(s.toLowerCase().includes("expire")) return "ExpiresOn";
  return "Never";
}
function mapEmployee(row){
  const employeeId = pick(row, ["Employee ID", "EmployeeID", "ID", "Staff ID"]);
  const employeeName = pick(row, ["Employee Name", "Name", "Username", "Employee"]);
  if(!employeeId || !employeeName) throw new Error(`Row ${row.__row}: Employee ID and Employee Name are required.`);
  const status = normalizeStatus(pick(row, ["Status", "Account Status", "Active"]));
  return {
    employeeId,
    employeeName,
    fakeEmail: pick(row, ["Fake Email", "Email", "Account Email"]) || fakeEmailFor(employeeId),
    role: normalizeRole(pick(row, ["Role", "Permission", "Permissions"])),
    status,
    active: status === "Active",
    authUid: "",
    mustChangePassword: true,
    importedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}
function mapWriteup(row){
  const employeeId = pick(row, ["Employee ID", "EmployeeID", "ID", "Staff ID"]);
  const employeeName = pick(row, ["Employee Name", "Name", "Username", "Employee"]);
  const reason = pick(row, ["Reason", "Reason for Write-Up", "Write-Up Reason", "Description"]);
  if(!employeeId || !employeeName || !reason) throw new Error(`Row ${row.__row}: Employee ID, Employee Name, and Reason are required.`);
  const expiresOn = dateISO(pick(row, ["Expires On", "Expiration Date", "Expires"]));
  return {
    writeUpId: pick(row, ["WriteUp ID", "Write-Up ID", "ID"]) || newWriteUpId(),
    employeeId,
    employeeName,
    writeUpDate: dateISO(pick(row, ["Write-Up Date", "WriteUp Date", "Date"])) || new Date().toISOString().slice(0,10),
    reason,
    expiresMode: expiresOn ? "ExpiresOn" : normalizeExpiresMode(pick(row, ["Expires Mode", "Expiration", "Duration"])),
    expiresOn,
    createdById: session()?.employeeId || "IMPORT",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    importedAt: serverTimestamp()
  };
}
function previewRows(){
  const type = $("importType")?.value || "employees";
  const text = $("importPaste")?.value || "";
  const box = $("importPreview");
  try{
    const rows = parseSheet(text);
    const mapped = rows.slice(0, 8).map(r => type === "employees" ? mapEmployee(r) : mapWriteup(r));
    box.innerHTML = `<p class="muted">Previewing ${mapped.length} of ${rows.length} row(s).</p>` + mapped.map(item => `
      <div class="importPreviewItem">
        <strong>${esc(item.employeeName)} (${esc(item.employeeId)})</strong>
        <span>${type === "employees" ? `${esc(item.role)} • ${esc(item.status)} • ${esc(item.fakeEmail)}` : `${esc(item.writeUpDate)} • ${esc(item.expiresMode)} • ${esc(item.reason).slice(0, 120)}`}</span>
      </div>
    `).join("");
  }catch(err){
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}
async function importRows(){
  if(!isCEO()) return toast("Import blocked", "Only CEO accounts can import pasted sheet data.");
  if(!auth.currentUser) return toast("Import blocked", "Please sign in again before importing.");
  const btn = $("importBtn");
  const type = $("importType")?.value || "employees";
  let rows;
  try{ rows = parseSheet($("importPaste")?.value || ""); }catch(err){ return toast("Import failed", err.message); }
  btn.disabled = true;
  btn.innerText = "Importing...";
  let count = 0;
  try{
    for(const row of rows){
      if(type === "employees"){
        const employee = mapEmployee(row);
        await setDoc(doc(db, "employees", employee.employeeId), employee, { merge: true });
      }else{
        const writeup = mapWriteup(row);
        await setDoc(doc(db, "writeups", writeup.writeUpId), writeup, { merge: true });
      }
      count++;
    }
    await addDoc(collection(db, "auditLogs"), {
      timestamp: serverTimestamp(),
      actorId: session()?.employeeId || auth.currentUser.uid,
      actorRole: session()?.role || "",
      action: type === "employees" ? "EMPLOYEE_IMPORT" : "WRITEUP_IMPORT",
      targetEmployeeId: "",
      writeUpId: "",
      details: `Imported ${count} ${type} row(s) from pasted Google Sheets data.`,
      userAgent: navigator.userAgent || ""
    });
    $("importPaste").value = "";
    previewRows();
    toast("Import complete", `Imported ${count} ${type} row(s).`);
    if($("employeeRefreshBtn")) $("employeeRefreshBtn").click();
    if($("refreshBtn")) $("refreshBtn").click();
  }catch(err){
    toast("Import failed", err.message || "Could not import pasted data.");
  }finally{
    btn.disabled = false;
    btn.innerText = "Import pasted data";
  }
}

function injectImportUI(){
  if($("importPage")) return;
  const side = document.querySelector(".side-card");
  const pageArea = document.querySelector(".pageArea");
  if(!side || !pageArea) return;
  const btn = document.createElement("button");
  btn.className = "navBtn ceoOnly";
  btn.type = "button";
  btn.dataset.page = "importPage";
  btn.textContent = "Import Data";
  const accountBtn = Array.from(side.querySelectorAll(".navBtn")).find(b => b.dataset.page === "accountPage");
  side.insertBefore(btn, accountBtn || null);
  const page = document.createElement("section");
  page.className = "portalPage hidden";
  page.id = "importPage";
  page.innerHTML = `
    <div class="page-title"><div><p class="eyebrow">Bulk Entry</p><h2>Import Data</h2></div></div>
    <section class="card import-card">
      <div class="card-hd"><h2>Paste from Google Sheets</h2></div>
      <div class="card-bd">
        <div class="hint"><span></span><p>Copy rows from Google Sheets, including the header row, then paste them below. This supports tab-separated Google Sheets paste data.</p></div>
        <div class="form-grid">
          <div><label for="importType">Import type</label><select id="importType"><option value="employees">Employees</option><option value="writeups">Write-Ups</option></select></div>
          <div><label>First-login password for imported employees</label><input value="${OTP}" disabled /></div>
        </div>
        <label for="importPaste">Pasted sheet data</label>
        <textarea id="importPaste" class="importTextarea" placeholder="Employee ID&#9;Employee Name&#9;Role&#9;Status&#10;0001&#9;Executive_Eagle&#9;CEO&#9;Active"></textarea>
        <div class="importExamples">
          <p><strong>Employee headers:</strong> Employee ID, Employee Name, Role, Status, Fake Email</p>
          <p><strong>Write-Up headers:</strong> Employee ID, Employee Name, Write-Up Date, Reason, Expires On</p>
        </div>
        <div class="actions"><button class="ghost" id="previewImportBtn" type="button">Preview</button><button id="importBtn" type="button">Import pasted data</button></div>
        <div id="importPreview" class="importPreview"><p class="muted">Preview will appear here.</p></div>
      </div>
    </section>
  `;
  pageArea.appendChild(page);
  document.head.insertAdjacentHTML("beforeend", `<style id="importStyles">.importTextarea{min-height:260px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.importExamples{border:1px solid rgba(15,23,42,.08);background:#fff;border-radius:16px;padding:12px;margin-top:10px}.importExamples p{margin:4px 0;color:var(--muted);font-size:12px}.importPreview{margin-top:14px;display:flex;flex-direction:column;gap:10px}.importPreviewItem{border:1px solid rgba(15,23,42,.10);border-radius:14px;padding:10px;background:#fff}.importPreviewItem strong{display:block;font-size:13px}.importPreviewItem span{display:block;color:var(--muted);font-size:12px;margin-top:4px}</style>`);
  $("previewImportBtn").addEventListener("click", previewRows);
  $("importBtn").addEventListener("click", importRows);
  $("importPaste").addEventListener("input", () => {
    clearTimeout(window.__importPreviewTimer);
    window.__importPreviewTimer = setTimeout(previewRows, 350);
  });
  $("importType").addEventListener("change", previewRows);
}

window.addEventListener("DOMContentLoaded", () => {
  injectImportUI();
  setInterval(injectImportUI, 1200);
});
