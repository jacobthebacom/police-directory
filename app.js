const state = {
  level: "us",        // "us" | "state"
  stateName: null,
  countyFips: null
};

let DATA = [];
let map;
let statesLayer;      // the leaflet layer for the US states
let countiesLayer;    // the leaflet layer for the current state's counties
let ALL_COUNTIES = null; // cached full county geojson (fetched once)

// ------------------------------------------------------------------
// data
// ------------------------------------------------------------------
async function loadData() {
  const res = await fetch("data/officers.json");
  DATA = await res.json();
}

function countsByState() {
  const counts = {};
  DATA.forEach(o => {
    counts[o.state_name] = (counts[o.state_name] || 0) + 1;
  });
  return counts;
}

function countsByCounty() {
  const counts = {};
  DATA.forEach(o => {
    if (o.county_fips) counts[o.county_fips] = (counts[o.county_fips] || 0) + 1;
  });
  return counts;
}

function colorForCount(n) {
  if (!n) return "#1a1f28";
  if (n < 5) return "#234a7a";
  if (n < 20) return "#3b76bd";
  return "#6ea8fe";
}

// state name -> 2-digit FIPS (needed to filter counties for a state)
const STATE_FIPS = {
  "Alabama":"01","Alaska":"02","Arizona":"04","Arkansas":"05","California":"06",
  "Colorado":"08","Connecticut":"09","Delaware":"10","Florida":"12","Georgia":"13",
  "Hawaii":"15","Idaho":"16","Illinois":"17","Indiana":"18","Iowa":"19","Kansas":"20",
  "Kentucky":"21","Louisiana":"22","Maine":"23","Maryland":"24","Massachusetts":"25",
  "Michigan":"26","Minnesota":"27","Mississippi":"28","Missouri":"29","Montana":"30",
  "Nebraska":"31","Nevada":"32","New Hampshire":"33","New Jersey":"34","New Mexico":"35",
  "New York":"36","North Carolina":"37","North Dakota":"38","Ohio":"39","Oklahoma":"40",
  "Oregon":"41","Pennsylvania":"42","Rhode Island":"44","South Carolina":"45",
  "South Dakota":"46","Tennessee":"47","Texas":"48","Utah":"49","Vermont":"50",
  "Virginia":"51","Washington":"53","West Virginia":"54","Wisconsin":"55","Wyoming":"56",
  "District of Columbia":"11"
};

// ------------------------------------------------------------------
// map init
// ------------------------------------------------------------------
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([39.8, -98.6], 4);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
    minZoom: 3
  }).addTo(map);

  document.getElementById("total-count").textContent = DATA.length;
  const statesWith = new Set(DATA.map(o => o.state_name));
  document.getElementById("state-count").textContent = statesWith.size;

  loadStatesLayer();
}

function loadStatesLayer() {
  if (statesLayer) { statesLayer.addTo(map); return; }
  fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json")
    .then(r => r.json())
    .then(geo => {
      const counts = countsByState();
      statesLayer = L.geoJSON(geo, {
        style: feature => {
          const name = feature.properties.name;
          return {
            color: "#2a3340",
            weight: 1,
            fillColor: colorForCount(counts[name] || 0),
            fillOpacity: 0.85
          };
        },
        onEachFeature: (feature, layer) => {
          const name = feature.properties.name;
          const n = counts[name] || 0;

          layer.bindTooltip(
            `<div class="state-tooltip">${name.toUpperCase()}
               <span class="tt-count">${n} ${n === 1 ? "entry" : "entries"}</span>
             </div>`,
            { sticky: true, direction: "top" }
          );

          layer.on({
            mouseover: e => e.target.setStyle({ weight: 2, color: "#6ea8fe" }),
            mouseout:  e => e.target.setStyle({ weight: 1, color: "#2a3340" }),
            click:     () => selectState(name)
          });
        }
      }).addTo(map);
    });
}

// ------------------------------------------------------------------
// state -> county drill-down
// ------------------------------------------------------------------
async function selectState(stateName) {
  state.level = "state";
  state.stateName = stateName;
  state.countyFips = null;

  document.getElementById("breadcrumb").textContent = `United States / ${stateName}`;
  document.getElementById("back-btn").hidden = false;

  // hide states layer
  if (statesLayer) map.removeLayer(statesLayer);

  // fetch full US counties once, cache it
  if (!ALL_COUNTIES) {
    const r = await fetch("https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json");
    ALL_COUNTIES = await r.json();
  }

  const stateFips = STATE_FIPS[stateName];
  if (!stateFips) {
    renderResults();
    openDrawer();
    return;
  }

  // filter counties for this state
  const countiesForState = {
    type: "FeatureCollection",
    features: ALL_COUNTIES.features.filter(f =>
      String(f.id).padStart(5, "0").startsWith(stateFips)
    )
  };

  const counts = countsByCounty();

  countiesLayer = L.geoJSON(countiesForState, {
    style: feature => {
      const fips = String(feature.id).padStart(5, "0");
      return {
        color: "#2a3340",
        weight: 0.8,
        fillColor: colorForCount(counts[fips] || 0),
        fillOpacity: 0.85
      };
    },
    onEachFeature: (feature, layer) => {
      const fips = String(feature.id).padStart(5, "0");
      const countyName = feature.properties.NAME || feature.properties.name || "County";
      const n = counts[fips] || 0;

      layer.bindTooltip(
        `<div class="state-tooltip">${countyName.toUpperCase()}
           <span class="tt-count">${n} ${n === 1 ? "entry" : "entries"}</span>
         </div>`,
        { sticky: true, direction: "top" }
      );

      layer.on({
        mouseover: e => e.target.setStyle({ weight: 2, color: "#6ea8fe" }),
        mouseout:  e => e.target.setStyle({ weight: 0.8, color: "#2a3340" }),
        click:     () => selectCounty(fips, countyName)
      });
    }
  }).addTo(map);

  // zoom to the state
  map.fitBounds(countiesLayer.getBounds(), { padding: [40, 40] });

  renderResults();   // show all entries for the state
  openDrawer();
}

function selectCounty(fips, countyName) {
  state.countyFips = fips;
  state.level = "county";
  document.getElementById("breadcrumb").textContent =
    `United States / ${state.stateName} / ${countyName}`;
  renderResults();
}

function backToUS() {
  state.level = "us";
  state.stateName = null;
  state.countyFips = null;

  document.getElementById("breadcrumb").textContent = "United States";
  document.getElementById("back-btn").hidden = true;

  if (countiesLayer) { map.removeLayer(countiesLayer); countiesLayer = null; }
  loadStatesLayer();

  map.setView([39.8, -98.6], 4);

  renderResults();
  closeDrawer();
}

// ------------------------------------------------------------------
// drawer + results
// ------------------------------------------------------------------
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
  let filtered = DATA;
  if (state.countyFips) {
    filtered = DATA.filter(o => o.county_fips === state.countyFips);
  } else if (state.stateName) {
    filtered = DATA.filter(o => o.state_name === state.stateName);
  }

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
        ${o.county} County, ${o.state_name}<br/>
        ${o.separation_date} · ${o.separation_type}
      </div>
      <span class="badge ${o.status}">${o.status}</span>
      <div style="margin-top:.5rem">${sources}</div>
      ${o.officer_response ? `<p style="font-size:.76rem;color:#9aa3b2;margin:.5rem 0 0">Response: ${o.officer_response}</p>` : ""}
    </div>
  `;
}

// ------------------------------------------------------------------
// wiring
// ------------------------------------------------------------------
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
document.getElementById("back-btn").addEventListener("click", backToUS);

(async function main() {
  await loadData();
  initMap();
  renderResults();
})();
