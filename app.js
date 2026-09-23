const state = {
  level: "us",
  stateName: null,
  countyFips: null,
  query: ""
};

let DATA = [];
let map;
let statesLayer;
let countiesLayer;
let ALL_COUNTIES = null;

// ------------------------------------------------------------------
// data
// ------------------------------------------------------------------
async function loadData() {
  const res = await fetch("data/officers.json");
  DATA = await res.json();
}

function countsByState() {
  const counts = {};
  DATA.forEach(o => { counts[o.state_name] = (counts[o.state_name] || 0) + 1; });
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
// map
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
            color: "#2a3340", weight: 1,
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

async function selectState(stateName) {
  state.level = "state";
  state.stateName = stateName;
  state.countyFips = null;

  document.getElementById("breadcrumb").textContent = `United States / ${stateName}`;
  document.getElementById("back-btn").hidden = false;

  if (statesLayer) map.removeLayer(statesLayer);

  if (!ALL_COUNTIES) {
    const r = await fetch("https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json");
    ALL_COUNTIES = await r.json();
  }

  const stateFips = STATE_FIPS[stateName];
  if (!stateFips) { renderResults(); openDrawer(); return; }

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
        color: "#2a3340", weight: 0.8,
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

  map.fitBounds(countiesLayer.getBounds(), { padding: [40, 40] });
  renderResults();
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
// drawer
// ------------------------------------------------------------------
function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer-close").classList.add("show");
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-close").classList.remove("show");
}

// ------------------------------------------------------------------
// search + filtering
// ------------------------------------------------------------------
function matchesQuery(o, q) {
  if (!q) return true;
  const hay = [
    o.name, o.former_department, o.current_department,
    o.county, o.state_name, o.separation_type, o.status
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function highlight(text, q) {
  if (!q || !text) return text || "";
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text;
  return text.slice(0, i) +
         `<mark>${text.slice(i, i + q.length)}</mark>` +
         text.slice(i + q.length);
}

function renderResults() {
  const results = document.getElementById("results");
  const q = state.query.toLowerCase().trim();

  let filtered;
  if (q) {
    filtered = DATA.filter(o => matchesQuery(o, q));
  } else if (state.countyFips) {
    filtered = DATA.filter(o => o.county_fips === state.countyFips);
  } else if (state.stateName) {
    filtered = DATA.filter(o => o.state_name === state.stateName);
  } else {
    filtered = DATA;
  }

  const countLine = q
    ? `<div class="results-count">${filtered.length} result${filtered.length === 1 ? "" : "s"} for "${escapeHTML(state.query)}"</div>`
    : "";

  if (!filtered.length) {
    results.innerHTML = countLine +
      `<p class="hint">${q ? "No matches." : "No entries yet for this area."}</p>`;
    return;
  }

  results.innerHTML = countLine + filtered.map(o => entryHTML(o, q)).join("");
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function entryHTML(o, q) {
  const sourceLinks = o.sources
    .map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${escapeHTML(s.label)}</a><span class="src-type">${escapeHTML(s.type || "")}</span></li>`)
    .join("");

  const typeClass = (o.separation_type || "").toLowerCase().replace(/\s+/g, "-");
  const dept = escapeHTML(o.former_department || "—");
  const current = o.current_department ? ` → ${escapeHTML(o.current_department)}` : "";
  const county = o.county ? `${escapeHTML(o.county)} County, ` : "";
  const stateName = escapeHTML(o.state_name || "");

  return `
    <div class="entry">
      <h3>${highlight(escapeHTML(o.name), q)}</h3>

      <div class="meta">
        <div class="meta-row"><span class="meta-label">Dept</span><span class="meta-val">${highlight(dept, q)}${current}</span></div>
        <div class="meta-row"><span class="meta-label">Location</span><span class="meta-val">${highlight(county, q)}${highlight(stateName, q)}</span></div>
        <div class="meta-row"><span class="meta-label">Date</span><span class="meta-val">${o.separation_date}</span></div>
      </div>

      <div class="pills">
        <span class="badge ${o.status}">${o.status}</span>
        <span class="badge type ${typeClass}">${escapeHTML(o.separation_type)}</span>
      </div>

      <div class="sources-block">
        <div class="sources-head">Sources</div>
        <ul class="sources-list">${sourceLinks}</ul>
      </div>

      ${o.officer_response ? `<p class="officer-response"><strong>Response:</strong> ${escapeHTML(o.officer_response)}</p>` : ""}
    </div>
  `;
}

// ------------------------------------------------------------------
// search wiring
// ------------------------------------------------------------------
function initSearch() {
  const input = document.getElementById("search-input");
  const clear = document.getElementById("search-clear");

  if (!input || !clear) {
    console.warn("Search elements not found in DOM");
    return;
  }

  input.addEventListener("input", () => {
    state.query = input.value;
    clear.hidden = !state.query;
    if (state.query) openDrawer();
    renderResults();
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      input.value = "";
      state.query = "";
      clear.hidden = true;
      renderResults();
      input.blur();
    }
  });

  clear.addEventListener("click", () => {
    input.value = "";
    state.query = "";
    clear.hidden = true;
    renderResults();
    input.focus();
  });

  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

// ------------------------------------------------------------------
// mobile menu + brand home
// ------------------------------------------------------------------
function initMobileMenu() {
  const menuBtn = document.getElementById("menu-btn");
  const menu = document.getElementById("mobile-menu");

  if (!menuBtn || !menu) return;

  menuBtn.addEventListener("click", e => {
    e.stopPropagation();
    const isOpen = !menu.hidden;
    menu.hidden = isOpen;
    menuBtn.setAttribute("aria-expanded", String(!isOpen));
  });

  // close when clicking a link
  menu.querySelectorAll("[data-menu-close]").forEach(a => {
    a.addEventListener("click", () => {
      menu.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });

  // close when clicking anywhere else
  document.addEventListener("click", e => {
    if (menu.hidden) return;
    if (!menu.contains(e.target) && e.target !== menuBtn) {
      menu.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });

  // close on Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !menu.hidden) {
      menu.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });
}

function initBrandHome() {
  const brandEl = document.getElementById("brand-home");
  if (!brandEl) return;
  brandEl.addEventListener("click", backToUS);
  brandEl.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      backToUS();
    }
  });
}

// ------------------------------------------------------------------
// boot
// ------------------------------------------------------------------
document.getElementById("drawer-close").addEventListener("click", closeDrawer);
document.getElementById("back-btn").addEventListener("click", backToUS);

(async function main() {
  await loadData();
  initMap();
  initSearch();
  initMobileMenu();
  initBrandHome();
  renderResults();
})();
