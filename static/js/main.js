/* Endpoint-aware UI with pretty renderers for suburb + property */

const runBtn = document.getElementById("runBtn");
const resource = document.getElementById("resource");
const endpoint = document.getElementById("endpoint");
const suburb = document.getElementById("suburb");
const token = document.getElementById("token");
const geojson = document.getElementById("geojson");

const jsonEl = document.getElementById("json");
const tableEl = document.getElementById("table");
const highlightsEl = document.getElementById("highlights");

let map, chart, markersLayer, geoLayer;

/* --------------------- helpers --------------------- */
function ensureMap() {
  if (!map) {
    map = L.map("map").setView([-33.8688, 151.2093], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  }
  return map;
}
function setBusy(b) {
  runBtn.disabled = b;
  runBtn.textContent = b ? "Loading..." : "Run";
}
function escapeHtml(v) {
  if (v == null) return "";
  return String(v).replace(
    /[&<>"']/g,
    (s) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        s
      ])
  );
}
function flatten(obj, p = "") {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v))
      Object.assign(out, flatten(v, key));
    else out[key] = v;
  });
  return out;
}
function topNumeric(obj, n = 8) {
  return Object.entries(flatten(obj))
    .filter(([, v]) => typeof v === "number" && isFinite(v))
    .slice(0, n);
}
function renderHighlightsKV(pairs) {
  highlightsEl.innerHTML = "";
  pairs.forEach(([k, v]) => {
    const val = typeof v === "number" ? v.toLocaleString() : escapeHtml(v);
    highlightsEl.insertAdjacentHTML(
      "beforeend",
      `<span class="pill"><strong>${escapeHtml(k)}</strong>: ${val}</span>`
    );
  });
}
function findArray(o) {
  if (Array.isArray(o) && o.length && typeof o[0] === "object") return o;
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) {
      const f = findArray(v);
      if (f) return f;
    }
  }
  return null;
}
function renderChartFromPairs(pairs, title = "Key metrics") {
  const canvas = document.getElementById("chart");
  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: pairs.map((p) => p.label || p[0]),
      datasets: [{ label: title, data: pairs.map((p) => p.value || p[1]) }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#e9ecf1" } },
        y: { ticks: { color: "#e9ecf1" } },
      },
    },
  });
}
function clearMarkers() {
  if (markersLayer) {
    markersLayer.clearLayers();
    markersLayer.remove();
    markersLayer = null;
  }
}
function clearGeo() {
  if (geoLayer) {
    geoLayer.remove();
    geoLayer = null;
  }
}

/* simple interactive table */
function renderInteractiveTable(rows) {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const pageSize = 12;
  let page = 0;
  let sortKey = headers[0];
  let sortDir = 1;
  let q = "";
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";
  const controls = document.createElement("div");
  controls.className = "table-controls";
  controls.innerHTML = `<input id="filterBox" placeholder="Search..." /><div class="spacer"></div><div class="pager"><button id="prevBtn">Prev</button><span id="pageLbl"></span><button id="nextBtn">Next</button></div>`;
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headRow = document.createElement("tr");
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      if (sortKey === h) sortDir *= -1;
      else {
        sortKey = h;
        sortDir = 1;
      }
      render();
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(controls);
  wrapper.appendChild(table);
  tableEl.innerHTML = "";
  tableEl.appendChild(wrapper);
  function filterSortPaginate() {
    let filtered = rows;
    if (q) {
      const qq = q.toLowerCase();
      filtered = rows.filter((r) =>
        headers.some(
          (h) => r[h] !== undefined && String(r[h]).toLowerCase().includes(qq)
        )
      );
    }
    filtered = [...filtered].sort((a, b) => {
      const va = a[sortKey],
        vb = b[sortKey];
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * sortDir;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, totalPages - 1);
    const start = page * pageSize;
    return {
      slice: filtered.slice(start, start + pageSize),
      totalPages,
      count: filtered.length,
    };
  }
  function render() {
    const { slice, totalPages, count } = filterSortPaginate();
    tbody.innerHTML = "";
    slice.forEach((r) => {
      const tr = document.createElement("tr");
      headers.forEach((h) =>
        tr.insertAdjacentHTML("beforeend", `<td>${escapeHtml(r[h])}</td>`)
      );
      tbody.appendChild(tr);
    });
    wrapper.querySelector("#pageLbl").textContent = ` Page ${
      page + 1
    } / ${totalPages} — ${count} rows `;
  }
  controls.querySelector("#filterBox").addEventListener("input", (e) => {
    q = e.target.value;
    page = 0;
    render();
  });
  controls.querySelector("#prevBtn").addEventListener("click", () => {
    page = Math.max(0, page - 1);
    render();
  });
  controls.querySelector("#nextBtn").addEventListener("click", () => {
    page = page + 1;
    render();
  });
  render();
}

/* --------------------- endpoint lists --------------------- */
const ENDPOINTS = {
  suburb: [
    "summary",
    "amenity",
    "demographics",
    "development_applications",
    "ethnicity_by_pocket",
    "for_sale_properties",
    "market_insights",
    "market_insights_by_pocket",
    "market_insights_by_street",
    "risk_factors",
    "schools",
    "school_catchments",
    "similar_suburbs",
    "suburb_information",
    "zoning",
    "information",
  ],
};
function populateEndpoints() {
  const list = ENDPOINTS[resource.value] || [];
  endpoint.innerHTML = "";
  list.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e
      .replace(/_/g, " ")
      .replace(/\b\w/g, (s) => s.toUpperCase());
    endpoint.appendChild(opt);
  });
  if (list.length) endpoint.value = list[0];
}
populateEndpoints();
resource.addEventListener("change", populateEndpoints);

/* --------------------- pretty renderers --------------------- */
function renderSummaryCards(rows) {
  const cleaned = rows.map((r) => ({
    title: (r.name || "")
      .toString()
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (s) => s.toUpperCase()),
    score:
      typeof r.value === "string"
        ? Number((r.value || "").split("/")[0])
        : typeof r.value === "number"
        ? r.value
        : null,
    summary: r.summary || r.comment || "",
    tags: (r.adjectives || "")
      .toString()
      .split(",")
      .filter(Boolean)
      .slice(0, 4),
  }));
  let html = `<div class="insight-grid">`;
  cleaned.forEach((c) => {
    const badge =
      c.score != null
        ? `<span class="score-badge">${Math.round(c.score)}</span>`
        : "";
    const tags = c.tags
      .map((t) => `<span class="tag">${escapeHtml(t.trim())}</span>`)
      .join("");
    html += `
      <article class="insight-card">
        <header class="insight-head"><h3>${escapeHtml(
          c.title || "Insight"
        )}</h3>${badge}</header>
        <p class="insight-text">${escapeHtml(c.summary)}</p>
        <div class="tag-row">${tags}</div>
      </article>`;
  });
  html += `</div>`;
  tableEl.innerHTML = html;

  const top = cleaned
    .filter((c) => c.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((c) => ({ label: c.title, value: c.score }));
  if (top.length) renderChartFromPairs(top, "Top scores");
}

/* amenity markers for both suburb and property */
function renderAmenityMarkers(rows) {
  ensureMap();
  clearMarkers();
  markersLayer = L.layerGroup().addTo(map);
  const pts = [];
  for (const r of rows) {
    const lat = Number(r.lat || r.latitude);
    const lon = Number(r.lon || r.longitude);
    if (isFinite(lat) && isFinite(lon)) {
      pts.push([lat, lon]);
      L.marker([lat, lon]).addTo(markersLayer).bindPopup(`
        <div style="min-width:180px">
          <strong>${escapeHtml(r.name || r.category || "Amenity")}</strong><br/>
          ${escapeHtml(r.category || r.type || "")}<br/>
          ${lat.toFixed(5)}, ${lon.toFixed(5)}
        </div>`);
    }
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2));
}

/* property-specific pretty views */
const renderers = {
  "suburb:summary": ({ rows }) => {
    renderHighlightsKV([
      ["Location", suburb.value],
      ["Insights", rows.length],
    ]);
    renderSummaryCards(rows);
  },
  "suburb:amenity": ({ rows }) => {
    const byCat = group(rows, "category");
    renderHighlightsKV([
      ["Location", suburb.value],
      ["Amenities", rows.length],
      ["Categories", Object.keys(byCat).length],
    ]);
    renderChartFromPairs(toPairs(byCat).slice(0, 12), "Amenities by category");
    renderAmenityMarkers(rows);
    renderInteractiveTable(rows);
  },
  "property:amenities": ({ rows }) => {
    const byCat = group(rows, "category");
    renderHighlightsKV([
      ["Address", suburb.value],
      ["Nearby amenities", rows.length],
      ["Categories", Object.keys(byCat).length],
    ]);
    renderChartFromPairs(toPairs(byCat).slice(0, 12), "Nearby amenities");
    renderAmenityMarkers(rows);
    renderInteractiveTable(rows);
  },
  "property:information": ({ data }) => {
    const nums = topNumeric(data, 8).map(([k, v]) => ({ label: k, value: v }));
    renderHighlightsKV([["Address", suburb.value]]);
    if (nums.length) renderChartFromPairs(nums, "Key property metrics");
    const rows = findArray(data) || [];
    if (rows.length) renderInteractiveTable(rows);
  },
  "property:neighbours_information": ({ data }) => {
    renderHighlightsKV([
      ["Address", suburb.value],
      ["Type", "Neighbours Information"],
    ]);
    const rows = findArray(data) || [];
    rows.length
      ? renderInteractiveTable(rows)
      : (tableEl.innerHTML = "<p class='hint'>No neighbour records.</p>");
  },
  "property:property_history": ({ data }) => {
    const rows = findArray(data) || [];
    renderHighlightsKV([
      ["Address", suburb.value],
      ["History records", rows.length],
    ]);
    const byYear = rows.reduce((m, r) => {
      const y = r.year || r.sale_year || "Unknown";
      m[y] = (m[y] || 0) + 1;
      return m;
    }, {});
    renderChartFromPairs(
      Object.entries(byYear)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => a.label - b.label),
      "History count by year"
    );
    rows.length
      ? renderInteractiveTable(rows)
      : (tableEl.innerHTML = "<p class='hint'>No history records.</p>");
  },
  "property:development_applications": ({ data }) => {
    const rows = findArray(data) || [];
    renderHighlightsKV([
      ["Address", suburb.value],
      ["Applications", rows.length],
    ]);
    rows.length
      ? renderInteractiveTable(rows)
      : (tableEl.innerHTML =
          "<p class='hint'>No development applications.</p>");
  },
  "property:risk_factors": ({ data }) => {
    const nums = topNumeric(data, 10).map(([k, v]) => ({ label: k, value: v }));
    renderHighlightsKV([
      ["Address", suburb.value],
      ["Risk metrics", nums.length],
    ]);
    if (nums.length) renderChartFromPairs(nums, "Risk factors");
    const rows = findArray(data) || [];
    if (rows.length) renderInteractiveTable(rows);
  },
  "property:schools": ({ data }) => {
    const rows = findArray(data) || [];
    renderHighlightsKV([
      ["Address", suburb.value],
      ["Schools", rows.length],
    ]);
    rows.length
      ? renderInteractiveTable(rows)
      : (tableEl.innerHTML = "<p class='hint'>No school records.</p>");
  },
  "property:zoning": ({ data }) => {
    const rows = findArray(data) || [];
    renderHighlightsKV([
      ["Address", suburb.value],
      ["Zoning entries", rows.length],
    ]);
    rows.length
      ? renderInteractiveTable(rows)
      : (tableEl.innerHTML = "<p class='hint'>No zoning data.</p>");
  },
};

/* small helpers for grouping */
function group(arr, key) {
  return arr.reduce((m, r) => {
    const k = r[key] ?? "Unknown";
    m[k] = (m[k] || 0).push ? m[k] : [];
    m[k].push(r);
    return m;
  }, {});
}
function toPairs(mapObj) {
  return Object.entries(mapObj)
    .map(([label, rows]) => ({ label, value: rows.length }))
    .sort((a, b) => b.value - a.value);
}

/* --------------------- run --------------------- */
async function run() {
  const params = {
    resource: resource.value,
    endpoint: endpoint.value,
    token: token.value,
    geojson: geojson.checked ? "true" : "false",
  };
  if (resource.value === "suburb") params.suburb = suburb.value;
  else {
    params.address = suburb.value;
    params.suburb = suburb.value;
  }

  setBusy(true);
  try {
    const res = await fetch(`/api/proxy?${new URLSearchParams(params)}`);
    const isJson = res.headers
      .get("content-type")
      ?.includes("application/json");
    const data = isJson ? await res.json() : { raw: await res.text() };
    jsonEl.textContent = JSON.stringify(data, null, 2);

    ensureMap();
    clearMarkers();
    clearGeo();

    // draw GeoJSON if present
    (function findGeo(o) {
      if (!o || typeof o !== "object") return;
      if (o.type === "FeatureCollection" && !geoLayer) {
        geoLayer = L.geoJSON(o, { style: { weight: 1 } }).addTo(map);
        try {
          map.fitBounds(geoLayer.getBounds().pad(0.2));
        } catch (e) {}
        return;
      }
      for (const v of Object.values(o)) findGeo(v);
    })(data);

    const rows = findArray(data) || [];

    // Choose renderer if available
    const key = `${resource.value}:${endpoint.value}`;
    if (renderers[key]) {
      renderers[key]({ data, rows });
      return;
    }

    // fallback: numerics + table
    const numerics = topNumeric(data, 8);
    renderHighlightsKV(
      numerics.length ? numerics : [["Location", suburb.value]]
    );
    if (numerics.length)
      renderChartFromPairs(
        numerics.map(([k, v]) => ({ label: k, value: v })),
        "Key metrics"
      );
    rows.length
      ? renderInteractiveTable(rows)
      : (tableEl.innerHTML =
          "<p class='hint'>No tabular data detected for this endpoint.</p>");
  } catch (e) {
    jsonEl.textContent = JSON.stringify({ error: String(e) }, null, 2);
    tableEl.innerHTML = "";
  } finally {
    setBusy(false);
  }
}

runBtn.addEventListener("click", run);
