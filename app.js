const state = { level: "us", stateName: null };
let DATA = [];
let map;

async function loadData() {
  const res = await fetch("data/officers.json");
  DATA = await res.json();
}

function initMap() {
  map = L.map("map").setView([39.8, -98.6], 4);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 12
  }).addTo(map);

  fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json")
    .then(r => r.json())
    .then(geo => {
      L.geoJSON(geo, {
        style: { color: "#3a4150", weight: 1, fillColor: "#1a1f28", fillOpacity: 1 },
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: e => e.target.setStyle({ fillColor: "#2a3550" }),
            mouseout:  e => e.target.setStyle({ fillColor: "#1a1f28" }),
            click:     () => selectState(feature.properties.name)
          });
        }
      }).addTo(map);
    });
}

function selectState(stateName) {
  state.level = "state";
  state.stateName = stateName;
  document.getElementById("breadcrumb").textContent = `United States / ${stateName}`;
  renderResults();
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
      <div style="margin-top:.4rem">${sources}</div>
      ${o.officer_response ? `<p style="font-size:.78rem;color:#9aa3b2">Response: ${o.officer_response}</p>` : ""}
    </div>
  `;
}

(async function main() {
  await loadData();
  initMap();
  renderResults();
})();
