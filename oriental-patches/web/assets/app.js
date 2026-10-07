const DATA_URL = new URL("../../data/patches.json", import.meta.url);

const GH_OWNER = "hmadfai";
const GH_REPO = "Dr_h";
const GH_WORKFLOW_FILE = "oriental-patches-scan.yml";
const GH_API_BASE = "https://api.github.com";
const TOKEN_STORAGE_KEY = "oriental-patches:gh-token";

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
  scanStatusText: document.getElementById("scan-status-text"),
  scanStatusLink: document.getElementById("scan-status-link"),
  rescanToggle: document.getElementById("rescan-toggle"),
  rescanPanel: document.getElementById("rescan-panel"),
  rescanManualLink: document.getElementById("rescan-manual-link"),
  tokenInput: document.getElementById("gh-token"),
  tokenRun: document.getElementById("gh-token-run"),
  tokenForget: document.getElementById("gh-token-forget"),
  rescanFeedback: document.getElementById("rescan-feedback"),
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
    const needsReview = (patch.tags || []).includes("needs-review");

    tr.innerHTML = `
      <td>
        <div class="patch-title">
          <strong>${escapeHtml(patch.title)}</strong>
          <span>${escapeHtml(desc)}</span>
          ${needsReview ? '<span class="needs-review-chip">Needs review</span>' : ""}
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

function getSavedToken() {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private browsing etc.) — ignore.
  }
}

function relativeTime(isoDate) {
  const then = new Date(isoDate).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const RUN_STATUS_LABEL = {
  completed_success: "succeeded",
  completed_failure: "failed",
  completed_cancelled: "cancelled",
  in_progress: "running…",
  queued: "queued…",
};

function describeRun(run) {
  const key =
    run.status === "completed" ? `completed_${run.conclusion}` : run.status;
  return RUN_STATUS_LABEL[key] || run.status;
}

async function refreshScanStatus() {
  const runsUrl = `${GH_API_BASE}/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW_FILE}/runs?per_page=1`;
  try {
    const res = await fetch(runsUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    const run = data.workflow_runs && data.workflow_runs[0];
    if (!run) {
      els.scanStatusText.textContent =
        "No scan has run yet — use Rescan now to start one.";
      els.scanStatusLink.hidden = true;
      return;
    }
    els.scanStatusText.textContent = `Last run ${describeRun(run)} · ${relativeTime(
      run.created_at
    )}`;
    els.scanStatusLink.href = run.html_url;
    els.scanStatusLink.hidden = false;
  } catch {
    els.scanStatusText.textContent =
      "Scan status unavailable (GitHub API unreachable).";
    els.scanStatusLink.hidden = true;
  }
}

function setFeedback(message, isError = false) {
  if (!els.rescanFeedback) return;
  els.rescanFeedback.textContent = message;
  els.rescanFeedback.style.color = isError ? "#a83a2a" : "";
}

async function triggerWorkflowDispatch(token) {
  const dispatchUrl = `${GH_API_BASE}/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW_FILE}/dispatches`;
  const res = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (res.status === 204) return { ok: true };
  let detail = "";
  try {
    const body = await res.json();
    detail = body.message || "";
  } catch {
    // ignore parse errors
  }
  return { ok: false, status: res.status, detail };
}

function bindRescanPanel() {
  const actionsUrl = `https://github.com/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW_FILE}`;
  els.rescanManualLink.href = actionsUrl;

  els.tokenInput.value = getSavedToken();

  els.rescanToggle.addEventListener("click", () => {
    const expanded = els.rescanToggle.getAttribute("aria-expanded") === "true";
    els.rescanToggle.setAttribute("aria-expanded", String(!expanded));
    els.rescanPanel.hidden = expanded;
  });

  els.tokenRun.addEventListener("click", async () => {
    const token = els.tokenInput.value.trim();
    if (!token) {
      setFeedback("Enter a GitHub token first, or use the manual link above.", true);
      return;
    }
    saveToken(token);
    setFeedback("Triggering scan…");
    try {
      const result = await triggerWorkflowDispatch(token);
      if (result.ok) {
        setFeedback("Scan triggered! It should appear in GitHub Actions within a minute.");
        setTimeout(refreshScanStatus, 4000);
      } else {
        setFeedback(
          `Could not trigger scan (HTTP ${result.status}). ${result.detail || "Check the token's scope and repo access."}`,
          true
        );
      }
    } catch {
      setFeedback("Network error reaching GitHub's API.", true);
    }
  });

  els.tokenForget.addEventListener("click", () => {
    saveToken("");
    els.tokenInput.value = "";
    setFeedback("Token forgotten.");
  });
}

async function init() {
  bindSorting();
  bindFilters();
  bindRescanPanel();
  refreshScanStatus();

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
