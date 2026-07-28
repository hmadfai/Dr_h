const DATA_URL = new URL("../../data/patches.json", import.meta.url);

const state = {
  patches: [],
  sortKey: "issued_on",
  sortDir: "desc",
};

const els = {
  keyboard: document.getElementById("filter-keyboard"),
  subtype: document.getElementById("filter-subtype"),
  dateFrom: document.getElementById("filter-date-from"),
  dateTo: document.getElementById("filter-date-to"),
  search: document.getElementById("filter-search"),
  reset: document.getElementById("reset-filters"),
  rows: document.getElementById("patch-rows"),
  count: document.getElementById("result-count"),
  empty: document.getElementById("empty-state"),
  updated: document.getElementById("updated-meta"),
};

function fillSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function formatDate(value) {
  if (!value) return { text: "Unknown", unknown: true };
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { text: value, unknown: false };
  return {
    text: d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    unknown: false,
  };
}

function matchesFilters(patch) {
  const keyboard = els.keyboard.value;
  const subtype = els.subtype.value;
  const from = els.dateFrom.value;
  const to = els.dateTo.value;
  const q = els.search.value.trim().toLowerCase();

  if (keyboard && patch.keyboard !== keyboard) return false;
  if (subtype && patch.subtype !== subtype) return false;

  const issued = patch.issued_on || "";
  if (from && (!issued || issued < from)) return false;
  if (to && (!issued || issued > to)) return false;

  if (q) {
    const haystack = [
      patch.title,
      patch.vendor,
      patch.description,
      patch.source,
      ...(patch.tags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

function compare(a, b) {
  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;
  let av = a[key];
  let bv = b[key];

  if (key === "issued_on") {
    av = av || "";
    bv = bv || "";
    if (av === bv) {
      return a.title.localeCompare(b.title) * dir;
    }
    if (!av) return 1;
    if (!bv) return -1;
    return av < bv ? -1 * dir : 1 * dir;
  }

  av = (av || "").toString().toLowerCase();
  bv = (bv || "").toString().toLowerCase();
  if (av === bv) return a.title.localeCompare(b.title);
  return av < bv ? -1 * dir : 1 * dir;
}

function render() {
  const filtered = state.patches.filter(matchesFilters).sort(compare);
  els.rows.replaceChildren();

  filtered.forEach((patch, index) => {
    const tr = document.createElement("tr");
    tr.style.animationDelay = `${Math.min(index, 12) * 25}ms`;

    const issued = formatDate(patch.issued_on);
    const desc = patch.description
      ? patch.description.length > 140
        ? `${patch.description.slice(0, 137)}…`
        : patch.description
      : "";

    tr.innerHTML = `
      <td>
        <div class="patch-title">
          <strong>${escapeHtml(patch.title)}</strong>
          <span>${escapeHtml(desc)}</span>
        </div>
      </td>
      <td><span class="chip chip-keyboard">${escapeHtml(patch.keyboard)}</span></td>
      <td><span class="chip chip-subtype">${escapeHtml(patch.subtype)}</span></td>
      <td class="date-cell ${issued.unknown ? "date-unknown" : ""}">${escapeHtml(issued.text)}</td>
      <td>${escapeHtml(patch.vendor || "—")}</td>
      <td><a class="link-out" href="${escapeAttr(patch.url)}" target="_blank" rel="noopener noreferrer">Open</a></td>
    `;
    els.rows.appendChild(tr);
  });

  els.count.textContent = `${filtered.length} of ${state.patches.length} patches`;
  els.empty.hidden = filtered.length > 0;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function bindSorting() {
  document.querySelectorAll(".patch-table th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = key === "issued_on" ? "desc" : "asc";
      }
      document.querySelectorAll(".patch-table th").forEach((el) => {
        el.classList.remove("sort-asc", "sort-desc");
      });
      th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
      render();
    });
  });
}

function bindFilters() {
  for (const el of [
    els.keyboard,
    els.subtype,
    els.dateFrom,
    els.dateTo,
    els.search,
  ]) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }

  els.reset.addEventListener("click", () => {
    els.keyboard.value = "";
    els.subtype.value = "";
    els.dateFrom.value = "";
    els.dateTo.value = "";
    els.search.value = "";
    render();
  });
}

async function init() {
  bindSorting();
  bindFilters();

  const response = await fetch(DATA_URL);
  if (!response.ok) {
    els.updated.textContent = "Could not load patch catalog.";
    els.count.textContent = "Failed to load data";
    return;
  }

  const data = await response.json();
  state.patches = data.patches || [];
  fillSelect(els.keyboard, data.keyboards || []);
  fillSelect(els.subtype, data.subtypes || []);

  const updated = data.updated_at
    ? new Date(data.updated_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "unknown";
  els.updated.textContent = `${state.patches.length} patches · updated ${updated}`;

  const issuedHeader = document.querySelector('th[data-sort="issued_on"]');
  if (issuedHeader) issuedHeader.classList.add("sort-desc");

  render();
}

init();
