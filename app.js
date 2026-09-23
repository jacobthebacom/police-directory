const state = { level: "us", stateName: null };
let DATA = [];
let map;
let geoLayer;

async function loadData() {
  const res = await fetch("data/officers.json");
  DATA = await res.json();
}

// count entries per state name (e.g. "Washington")
function countsByState() {
  const counts = {};
  DATA.forEach(o => {
    counts[o.state_name] = (counts[o.state_name] || 0) + 1;
  });
  return counts;
}

function colorForCount(n) {
  if (!n) return "#1a1f28";
  if (n < 5) return "#234a7a";
  if (n < 20) return "#3b76bd";
  return "#6ea8fe";
}

function initMap() {
  map = L.map("map", { zoomControl: true, attributionControl: true })
    .setView([39.8, -98.6], 4);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 12,
    minZoom: 3
  }).addTo(map);

  const counts = countsByState();

  fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json")
    .then(r => r.json())
    .then(geo => {
      geoLayer = L.geoJSON(geo, {
        style: feature => {
          const name = feature.properties.name;
          return {
            color: "#2a3340",
            weight: 1,
            fillColor: colorForCount(counts[name] || 0),
            fillOpacity: 1
          };
        },
        onEachFeature: (feature, layer) => {
          const name = feature.properties.name;
          const n = counts[name] || 0;

          layer.bindTooltip(
            `<div class="state-tooltip">${name.toUpperCase()}
               <span class="tt-count">${n} ${n === 1 ? "entry" : "entries"}</span>
             </div>`,
            { sticky: true, direction: "top", className: "state-tooltip-wrap" }
          );

          layer.on({
            mouseover: e => e.target.setStyle({ weight: 2, color: "#6ea8fe" }),
            mouseout:  e => e.target.setStyle({ weight: 1, color: "#2a3340" }),
            click:     () => selectState(name)
          });
        }
      }).addTo(map);
    });

  // global counters
  document.getElementById("total-count").textContent = DATA.length;
  const statesWith = new Set(DATA.map(o => o.state_name));
  document.getElementById("state-count").textContent = statesWith.size;
}

function selectState(stateName) {
  state.level = "state";
  state.stateName = stateName;
  document.getElementById("breadcrumb").textContent = `United States / ${stateName}`;
  renderResults();
  openDrawer();
}

function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer-close").classList.add("show");
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-close").classList.remove("show");
}

function renderResults() {
  const results = document.getElementById("results");
  const filtered = DATA.filter(o => {
    if (state.level === "us") return true;
    return o.state_name === state.stateName;
  });

  if (!filtered.length) {
    results.innerHTML = `<p class="hint">No entries yet for this area.</p>`;
    return;
  }
  results.innerHTML = filtered.map(entryHTML).join("");
}

function entryHTML(o) {
  const sources = o.sources
    .map(s => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`)
    .join(" · ");
  return `
    <div class="entry">
      <h3>${o.name}</h3>
      <div class="meta">
        ${o.former_department} → ${o.current_department || "—"}<br/>
        ${o.separation_date} · ${o.separation_type}
      </div>
      <span class="badge ${o.status}">${o.status}</span>
      <div style="margin-top:.5rem">${sources}</div>
      ${o.officer_response ? `<p style="font-size:.76rem;color:#9aa3b2;margin:.5rem 0 0">Response: ${o.officer_response}</p>` : ""}
    </div>
  `;
}

document.getElementById("drawer-close").addEventListener("click", closeDrawer);

(async function main() {
  await loadData();
  initMap();
  renderResults();
})();
