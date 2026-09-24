const API = ""; // same origin as serve.py

let entries = [];
let dirty = false;
let editingIndex = -1;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function setSaveState(state, text) {
  const el = $("#save-state");
  el.className = "save-state " + state;
  el.textContent = text;
}

function toast(msg, kind = "info") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + kind;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3000);
}

async function loadEntries() {
  const res = await fetch(`${API}/api/officers`);
  if (!res.ok) {
    toast("Failed to load entries", "error");
    return;
  }
  entries = await res.json();
  renderTable();
  setSaveState("saved", "Saved");
  dirty = false;
}

async function saveEntries() {
  setSaveState("dirty", "Saving…");
  try {
    const res = await fetch(`${API}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries)
    });
    const json = await res.json();
    if (!res.ok) {
      toast(json.error || "Save failed", "error");
      setSaveState("error", "Save failed");
      return false;
    }
    setSaveState("saved", `Saved (${json.count} entries)`);
    toast("Saved to data/officers.json", "success");
    dirty = false;
    return true;
  } catch (err) {
    toast("Network error: " + err.message, "error");
    setSaveState("error", "Save failed");
    return false;
  }
}

// ---------------- list view ----------------
function renderTable() {
  const q = ($("#list-search").value || "").toLowerCase().trim();
  const filtered = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => {
      if (!q) return true;
      const hay = [e.name, e.former_department, e.county, e.state_name].join(" ").toLowerCase();
      return hay.includes(q);
    });

  const tbody = $("#entry-tbody");
  tbody.innerHTML = filtered.map(({ e, i }) => `
    <tr>
      <td>${esc(e.name)}</td>
      <td>${esc(e.state_name || "")}</td>
      <td>${esc(e.county || "")}</td>
      <td>${esc(e.former_department || "")}</td>
      <td>${esc(e.separation_date || "—")}</td>
      <td><span class="pill ${typeClass(e.separation_type)}">${esc(e.separation_type || "—")}</span></td>
      <td><span class="pill ${esc(e.status || "")}">${esc(e.status || "")}</span></td>
      <td class="col-actions">
        <button class="btn btn-ghost btn-icon" data-action="edit" data-index="${i}">Edit</button>
      </td>
    </tr>
  `).join("");

  $("#list-count").textContent = `${filtered.length} of ${entries.length}`;
}

function typeClass(t) {
  return (t || "").toLowerCase().replace(/\s+/g, "-");
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ---------------- edit view ----------------
function showList() {
  $("#view-list").hidden = false;
  $("#view-edit").hidden = true;
}

function showEdit(index) {
  editingIndex = index;
  const e = index >= 0 ? entries[index] : emptyEntry();

  const form = $("#edit-form");
  form.reset();

  form.name.value = e.name || "";
  form.id.value = e.id || "";
  form.state_name.value = e.state_name || "";
  form.county.value = e.county || "";
  form.county_fips.value = e.county_fips || "";
  form.former_department.value = e.former_department || "";
  form.current_department.value = e.current_department || "";
  form.separation_date.value = e.separation_date || "";
  form.separation_type.value = e.separation_type || "";
  form.status.value = e.status || "";
  form.officer_response.value = e.officer_response || "";
  form.last_updated.value = e.last_updated || todayISO();

  renderSources(e.sources || []);

  $("#edit-title").textContent = index >= 0 ? `Edit — ${e.name || "entry"}` : "New entry";
  $("#btn-delete").hidden = index < 0;

  $("#view-list").hidden = true;
  $("#view-edit").hidden = false;
  form.name.focus();
}

function emptyEntry() {
  return {
    id: "",
    name: "",
    state_name: "",
    county: "",
    county_fips: "",
    former_department: "",
    current_department: null,
    separation_date: "",
    separation_type: "",
    status: "confirmed",
    sources: [{ type: "news", url: "", label: "" }],
    officer_response: null,
    last_updated: todayISO()
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------- sources editor ----------------
function renderSources(sources) {
  const wrap = $("#sources-list");
  wrap.innerHTML = "";
  sources.forEach(s => addSourceRow(s.type, s.url, s.label));
}

function addSourceRow(type = "news", url = "", label = "") {
  const wrap = $("#sources-list");
  const row = document.createElement("div");
  row.className = "source-row";
  row.innerHTML = `
    <select class="src-type">
      <option value="news">news</option>
      <option value="court">court</option>
      <option value="government">government</option>
      <option value="social">social</option>
      <option value="other">other</option>
    </select>
    <input class="src-label" type="text" placeholder="Label" value="${esc(label)}" />
    <input class="src-url" type="url" placeholder="https://…" value="${esc(url)}" />
    <button type="button" class="source-remove" title="Remove">×</button>
  `;
  row.querySelector(".src-type").value = type;
  row.querySelector(".source-remove").addEventListener("click", () => row.remove());
  wrap.appendChild(row);
}

function collectSources() {
  return $$(".source-row").map(row => ({
    type: row.querySelector(".src-type").value,
    url: row.querySelector(".src-url").value.trim(),
    label: row.querySelector(".src-label").value.trim()
  })).filter(s => s.url || s.label);
}

// ---------------- save from form ----------------
function collectForm() {
  const f = $("#edit-form");
  return {
    id: f.id.value.trim(),
    name: f.name.value.trim(),
    state_name: f.state_name.value.trim(),
    county: f.county.value.trim(),
    county_fips: f.county_fips.value.trim(),
    former_department: f.former_department.value.trim(),
    current_department: f.current_department.value.trim() || null,
    separation_date: f.separation_date.value || null,
    separation_type: f.separation_type.value,
    status: f.status.value,
    sources: collectSources(),
    officer_response: f.officer_response.value.trim() || null,
    last_updated: f.last_updated.value || todayISO()
  };
}

async function saveFormEntry() {
  const f = $("#edit-form");
  if (!f.checkValidity()) { f.reportValidity(); return; }

  const entry = collectForm();

  if (!entry.sources.length) {
    toast("Add at least one source", "error");
    return;
  }

  if (editingIndex >= 0) {
    entries[editingIndex] = entry;
  } else {
    // check duplicate ID
    if (entries.some(e => e.id === entry.id)) {
      toast("An entry with that ID already exists", "error");
      return;
    }
    entries.push(entry);
  }

  dirty = true;
  const ok = await saveEntries();
  if (ok) {
    renderTable();
    showList();
  }
}

async function deleteEntry() {
  if (editingIndex < 0) return;
  const e = entries[editingIndex];
  if (!confirm(`Delete entry "${e.name}"? This cannot be undone (a backup will be saved).`)) return;
  entries.splice(editingIndex, 1);
  dirty = true;
  const ok = await saveEntries();
  if (ok) {
    renderTable();
    showList();
  }
}

// ---------------- wiring ----------------
document.addEventListener("DOMContentLoaded", () => {
  // top
  $("#btn-new").addEventListener("click", () => showEdit(-1));

  // list
  $("#list-search").addEventListener("input", renderTable);
  $("#entry-tbody").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-action='edit']");
    if (!btn) return;
    showEdit(Number(btn.dataset.index));
  });

  // edit
  $("#btn-cancel").addEventListener("click", () => {
    if (dirty) {
      if (!confirm("You have unsaved changes. Leave anyway?")) return;
    }
    showList();
  });
  $("#btn-save").addEventListener("click", saveFormEntry);
  $("#btn-delete").addEventListener("click", deleteEntry);
  $("#btn-add-source").addEventListener("click", () => addSourceRow());

  // warn on unload if dirty
  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  loadEntries();
});
