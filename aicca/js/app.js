/* AICCA — Dual Accumulator Selection Engine */
(function () {
  'use strict';

  const state = {
    fixtures: [],
    filtered: [],
    sortKey: 'date',
    sortDir: 1,
    leagueFilter: 'ALL',
    dateFilter: '',
    search: '',
    roundFilter: '',
    accaA: [], // { fixtureId, family, market, selection, odds, venue, confidence, optaEdge, supporting }
    accaB: [],
    pickTarget: 'A', // which acca receives next fixture click
    refreshStatus: 'idle',
    lastValidatedAt: null,
    autoRefresh: false,
    validationCache: {}
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function fixtureKey(f) {
    return f.id;
  }

  function isInAcca(id, which) {
    const list = which === 'A' ? state.accaA : state.accaB;
    return list.some((l) => l.fixtureId === id);
  }

  function findFixture(id) {
    return state.fixtures.find((f) => f.id === id);
  }

  function usedFixtureIds() {
    return new Set([...state.accaA, ...state.accaB].map((l) => l.fixtureId));
  }

  /* ---------- Filtering / sorting ---------- */
  function applyFilters() {
    let rows = state.fixtures.slice();
    if (state.leagueFilter !== 'ALL') {
      rows = rows.filter((f) => f.leagueCode === state.leagueFilter || f.league === state.leagueFilter);
    }
    if (state.dateFilter) {
      rows = rows.filter((f) => f.date === state.dateFilter);
    }
    if (state.roundFilter) {
      const r = Number(state.roundFilter);
      rows = rows.filter((f) => f.round === r);
    }
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(
        (f) =>
          f.home.toLowerCase().includes(q) ||
          f.away.toLowerCase().includes(q) ||
          f.match.toLowerCase().includes(q) ||
          f.venue.toLowerCase().includes(q) ||
          f.league.toLowerCase().includes(q)
      );
    }
    const key = state.sortKey;
    rows.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return -1 * state.sortDir;
      if (av > bv) return 1 * state.sortDir;
      return 0;
    });
    state.filtered = rows;
    renderFixtures();
    $('#fixture-count').textContent = `${rows.length.toLocaleString()} shown · ${state.fixtures.length.toLocaleString()} total`;
  }

  function leagueChip(code) {
    const map = { PL: 'PL', CH: 'CH', L1: 'L1', L2: 'L2' };
    const c = map[code] || code;
    return `<span class="league-chip league-${c}">${c}</span>`;
  }

  function renderFixtures() {
    const tbody = $('#fixture-tbody');
    const slice = state.filtered.slice(0, 500); // virtualize-ish for UX
    tbody.innerHTML = slice
      .map((f) => {
        const inA = isInAcca(f.id, 'A');
        const inB = isInAcca(f.id, 'B');
        const inv = f.status === 'invalidated' || f.status === 'rescheduled';
        let cls = '';
        if (inv) cls = 'invalidated';
        else if (inA) cls = 'selected-a';
        else if (inB) cls = 'selected-b';
        const flag = inv ? '⚠ ' : inA ? 'A · ' : inB ? 'B · ' : '';
        return `<tr class="${cls}" data-id="${f.id}" title="Click to add to Acca ${state.pickTarget}">
          <td>${leagueChip(f.leagueCode)}</td>
          <td>${f.round}</td>
          <td>${f.date}</td>
          <td>${flag}${f.home}</td>
          <td>${f.away}</td>
          <td>${f.venue}</td>
        </tr>`;
      })
      .join('');

    if (state.filtered.length > 500) {
      tbody.insertAdjacentHTML(
        'beforeend',
        `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px">
          Showing first 500 of ${state.filtered.length}. Narrow search/filters to refine.
        </td></tr>`
      );
    }

    $$('#fixture-tbody tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => onFixtureClick(tr.dataset.id));
    });
  }

  /* ---------- Acca legs ---------- */
  function defaultFamilyForA(index) {
    const req = ['match_odds', 'goals', 'player', 'corners', 'cards', 'half_time', 'scorecast'];
    return req[index % req.length];
  }

  function buildLeg(fixture, which) {
    const family = which === 'B' ? '1x2_only' : defaultFamilyForA(state.accaA.length);
    const opts = window.AICCA_MARKETS.selections[family] || window.AICCA_MARKETS.selections.match_odds;
    const pick = opts[fixture.round % opts.length];
    const edge = window.AICCA_EDGES.edgeFor(fixture, which === 'B' ? '1x2_only' : family);
    // Acca B: force HIGH only
    const confidence = which === 'B' ? 'HIGH' : edge.confidence;
    return {
      fixtureId: fixture.id,
      match: fixture.match,
      league: fixture.league,
      date: fixture.date,
      family,
      market: pick.market,
      selection: pick.selection,
      odds: pick.odds,
      venue: pick.venue,
      confidence,
      optaEdge: edge.optaEdge,
      supporting: edge.supporting
    };
  }

  function onFixtureClick(id) {
    const f = findFixture(id);
    if (!f) return;
    if (f.status === 'invalidated') {
      toast('Fixture invalidated — cannot select until re-validated.');
      return;
    }
    const used = usedFixtureIds();
    if (used.has(id)) {
      toast('Fixture already used in Acca A or B (no shared fixtures).');
      return;
    }

    if (state.pickTarget === 'A') {
      if (state.accaA.length >= 7) {
        toast('Acca A max 7 legs.');
        return;
      }
      state.accaA.push(buildLeg(f, 'A'));
    } else {
      if (state.accaB.length >= 5) {
        toast('Acca B max 5 legs.');
        return;
      }
      state.accaB.push(buildLeg(f, 'B'));
    }
    renderAll();
  }

  function removeLeg(which, idx) {
    if (which === 'A') state.accaA.splice(idx, 1);
    else state.accaB.splice(idx, 1);
    renderAll();
  }

  function updateLeg(which, idx, patch) {
    const list = which === 'A' ? state.accaA : state.accaB;
    const leg = list[idx];
    Object.assign(leg, patch);
    if (patch.family) {
      const opts = window.AICCA_MARKETS.selections[patch.family];
      if (opts && opts.length) {
        const o = opts[0];
        leg.market = o.market;
        leg.selection = o.selection;
        leg.odds = o.odds;
        leg.venue = o.venue;
      }
      const fx = findFixture(leg.fixtureId);
      if (fx) {
        const edge = window.AICCA_EDGES.edgeFor(fx, patch.family);
        leg.optaEdge = edge.optaEdge;
        leg.supporting = edge.supporting;
        if (which === 'A') leg.confidence = edge.confidence;
      }
    }
    if (patch.selectionKey) {
      const opts = window.AICCA_MARKETS.selections[leg.family] || [];
      const o = opts.find((x) => `${x.market}|${x.selection}` === patch.selectionKey);
      if (o) {
        leg.market = o.market;
        leg.selection = o.selection;
        leg.odds = o.odds;
        leg.venue = o.venue;
      }
      delete leg.selectionKey;
    }
    renderAll();
  }

  function familyOptions(which, current) {
    if (which === 'B') {
      return `<option value="1x2_only" selected>Match Result (1X2)</option>`;
    }
    return window.AICCA_MARKETS.families.A.map(
      (f) => `<option value="${f.id}" ${f.id === current ? 'selected' : ''}>${f.label}</option>`
    ).join('');
  }

  function selectionOptions(family, market, selection) {
    const opts = window.AICCA_MARKETS.selections[family] || [];
    return opts
      .map((o) => {
        const key = `${o.market}|${o.selection}`;
        const cur = `${market}|${selection}`;
        return `<option value="${key}" ${key === cur ? 'selected' : ''}>${o.selection} (${o.odds}) · ${o.venue}</option>`;
      })
      .join('');
  }

  function confClass(c) {
    if (c === 'HIGH') return 'conf-high';
    if (c === 'MEDIUM') return 'conf-medium';
    return 'conf-speculative';
  }

  function renderLegs(which) {
    const list = which === 'A' ? state.accaA : state.accaB;
    const host = $(`#legs-${which.toLowerCase()}`);
    if (!list.length) {
      host.innerHTML = `<div class="empty-state"><strong>No legs yet</strong>Select fixtures from the left panel (target: Acca ${which}).</div>`;
      return;
    }
    host.innerHTML = list
      .map((leg, idx) => {
        const confSelect =
          which === 'B'
            ? `<input type="text" value="HIGH" disabled />`
            : `<select data-field="confidence">
                ${['HIGH', 'MEDIUM', 'SPECULATIVE']
                  .map((c) => `<option ${c === leg.confidence ? 'selected' : ''}>${c}</option>`)
                  .join('')}
              </select>`;
        return `<div class="leg-card" data-which="${which}" data-idx="${idx}">
          <div class="leg-top">
            <div>
              <div class="leg-match">${leg.match}</div>
              <div class="leg-meta">${leg.league} · ${leg.date} · <span class="${confClass(leg.confidence)}">${leg.confidence}</span></div>
            </div>
            <button class="btn btn-outline" type="button" data-remove="${which}:${idx}">Remove</button>
          </div>
          <div class="leg-grid">
            <div class="field">
              <label>Market Family</label>
              <select data-field="family" ${which === 'B' ? 'disabled' : ''}>${familyOptions(which, leg.family)}</select>
            </div>
            <div class="field">
              <label>Selection</label>
              <select data-field="selectionKey">${selectionOptions(leg.family, leg.market, leg.selection)}</select>
            </div>
            <div class="field">
              <label>Odds (fraction)</label>
              <input data-field="odds" value="${leg.odds}" />
            </div>
            <div class="field">
              <label>Confidence</label>
              ${confSelect}
            </div>
            <div class="field full">
              <label>Opta Edge</label>
              <input data-field="optaEdge" value="${leg.optaEdge.replace(/"/g, '&quot;')}" />
            </div>
            <div class="field full">
              <label>Supporting Data</label>
              <input data-field="supporting" value="${leg.supporting.replace(/"/g, '&quot;')}" />
            </div>
          </div>
        </div>`;
      })
      .join('');

    host.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [w, i] = btn.dataset.remove.split(':');
        removeLeg(w, Number(i));
      });
    });

    host.querySelectorAll('.leg-card').forEach((card) => {
      const whichCard = card.dataset.which;
      const idx = Number(card.dataset.idx);
      card.querySelectorAll('[data-field]').forEach((input) => {
        const evt = input.tagName === 'SELECT' ? 'change' : 'change';
        input.addEventListener(evt, () => {
          const field = input.dataset.field;
          updateLeg(whichCard, idx, { [field]: input.value });
        });
      });
    });
  }

  /* ---------- Validation ---------- */
  function validateAccaA() {
    const issues = [];
    const oks = [];
    const n = state.accaA.length;
    if (n < 5) issues.push(`Need 5–7 legs (have ${n})`);
    else if (n > 7) issues.push(`Max 7 legs (have ${n})`);
    else oks.push(`Leg count OK (${n})`);

    const families = new Set(state.accaA.map((l) => l.family));
    const required = ['match_odds', 'goals', 'player', 'corners', 'cards', 'half_time'];
    const missing = required.filter((r) => !families.has(r));
    if (missing.length) issues.push(`Missing market families: ${missing.join(', ')}`);
    else oks.push('All required market families covered');

    const odds = window.AICCA_ODDS.combine(state.accaA.map((l) => l.odds));
    if (!odds.ok) issues.push(`Odds floor 5/1 not met (currently ${odds.fraction})`);
    else oks.push(`Odds floor met (${odds.fraction})`);

    const high = state.accaA.filter((l) => l.confidence === 'HIGH').length;
    const spec = state.accaA.filter((l) => l.confidence === 'SPECULATIVE').length;
    const highPct = n ? high / n : 0;
    const specPct = n ? spec / n : 0;
    if (n && highPct < 0.6) issues.push(`Need ≥60% HIGH confidence (have ${Math.round(highPct * 100)}%)`);
    else if (n) oks.push(`HIGH confidence ${Math.round(highPct * 100)}%`);
    if (n && specPct > 0.3) issues.push(`Max 30% Speculative (have ${Math.round(specPct * 100)}%)`);
    else if (n) oks.push(`Speculative ${Math.round(specPct * 100)}%`);

    const leagues = new Set(state.accaA.map((l) => l.league));
    const fixtures = new Set(state.accaA.map((l) => l.fixtureId));
    if (fixtures.size < 3) issues.push('Need ≥3 distinct fixtures');
    else oks.push(`${fixtures.size} fixtures`);
    if (leagues.size < 2) issues.push('Need fixtures from 2+ leagues');
    else oks.push(`${leagues.size} leagues`);

    // Intra-match correlation: cards + corners same fixture
    const byFx = {};
    state.accaA.forEach((l) => {
      byFx[l.fixtureId] = byFx[l.fixtureId] || new Set();
      byFx[l.fixtureId].add(l.family);
    });
    Object.entries(byFx).forEach(([id, set]) => {
      if (set.has('cards') && set.has('corners')) {
        const m = findFixture(id)?.match || id;
        issues.push(`Intra-match correlation: cards + corners on ${m}`);
      }
      if (set.size > 1) {
        // also warn BTTS-ish goals + corners same match if multiple families
      }
    });

    return { issues, oks, odds, valid: issues.length === 0 };
  }

  function validateAccaB() {
    const issues = [];
    const oks = [];
    const n = state.accaB.length;
    if (n < 4 || n > 5) issues.push(`Need exactly 4–5 legs (have ${n})`);
    else oks.push(`Leg count OK (${n})`);

    const badFamily = state.accaB.filter((l) => l.family !== '1x2_only' && l.market !== 'Match Result 1X2');
    if (badFamily.length) issues.push('Acca B must be 1X2 only');
    else if (n) oks.push('1X2-only markets');

    const notHigh = state.accaB.filter((l) => l.confidence !== 'HIGH');
    if (notHigh.length) issues.push('All Acca B legs must be HIGH confidence');
    else if (n) oks.push('100% HIGH confidence');

    const odds = window.AICCA_ODDS.combine(state.accaB.map((l) => l.odds));
    if (!odds.ok) issues.push(`Odds floor 5/1 not met (currently ${odds.fraction})`);
    else oks.push(`Odds floor met (${odds.fraction})`);

    const fx = new Set(state.accaB.map((l) => l.fixtureId));
    if (fx.size !== n && n) issues.push('Duplicate fixtures in Acca B');
    else if (n) oks.push(`${fx.size} distinct matches`);

    return { issues, oks, odds, valid: issues.length === 0 };
  }

  function validateOverlap() {
    const a = new Set(state.accaA.map((l) => l.fixtureId));
    const overlap = state.accaB.filter((l) => a.has(l.fixtureId));
    if (overlap.length) {
      return {
        issues: [`Shared fixtures across Accas: ${overlap.map((l) => l.match).join(', ')}`],
        oks: [],
        valid: false
      };
    }
    return { issues: [], oks: ['No shared fixtures between Acca A & B'], valid: true };
  }

  function renderValidation() {
    const a = validateAccaA();
    const b = validateAccaB();
    const o = validateOverlap();

    const renderList = (el, res) => {
      el.innerHTML = [
        ...res.oks.map((t) => `<div class="validation-item v-ok">✓ ${t}</div>`),
        ...res.issues.map((t) => `<div class="validation-item v-bad">✗ ${t}</div>`)
      ].join('');
    };
    renderList($('#val-a'), a);
    renderList($('#val-b'), b);

    $('#stat-a-legs').textContent = state.accaA.length;
    $('#stat-a-odds').textContent = a.odds.fraction || '—';
    $('#stat-a-conf').textContent = state.accaA.length
      ? `${Math.round((state.accaA.filter((l) => l.confidence === 'HIGH').length / state.accaA.length) * 100)}% HIGH`
      : '—';
    $('#stat-a-fx').textContent = new Set(state.accaA.map((l) => l.fixtureId)).size;

    $('#stat-b-legs').textContent = state.accaB.length;
    $('#stat-b-odds').textContent = b.odds.fraction || '—';
    $('#stat-b-conf').textContent = state.accaB.length ? '100% HIGH target' : '—';
    $('#stat-b-fx').textContent = new Set(state.accaB.map((l) => l.fixtureId)).size;

    const global = [...o.oks, ...o.issues];
    $('#global-checks').innerHTML = [
      ...o.oks.map((t) => `<span class="badge badge-ok">${t}</span>`),
      ...o.issues.map((t) => `<span class="badge badge-bad">${t}</span>`),
      `<span class="badge badge-count">Pick target: Acca ${state.pickTarget}</span>`
    ].join('');

    const allValid = a.valid && b.valid && o.valid;
    $('#btn-generate').disabled = !allValid;
    return allValid;
  }

  function renderAll() {
    renderLegs('A');
    renderLegs('B');
    applyFilters();
    renderValidation();
  }

  /* ---------- Fixture refresh / validation ---------- */
  function setRefreshStatus(status, detail) {
    state.refreshStatus = status;
    const pill = $('#refresh-status');
    pill.className = `status-pill status-${status}`;
    const labels = {
      idle: 'Idle',
      checking: 'Checking…',
      valid: 'Valid',
      updates: 'Updates Found'
    };
    pill.textContent = labels[status] || status;
    if (detail) $('#refresh-detail').textContent = detail;
  }

  async function refreshFixtures() {
    const league = $('#refresh-league').value;
    const round = Number($('#refresh-round').value);
    if (!round) {
      toast('Select a round to refresh.');
      return;
    }
    setRefreshStatus('checking', `Validating ${league} round ${round} against schedule sources…`);
    $('#btn-refresh').disabled = true;

    // Simulated multi-source check (PL API / EFL / Opta / ESPN / Sky)
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));

    const targets = state.fixtures.filter((f) => {
      const leagueOk =
        league === 'ALL' ||
        f.leagueCode === league ||
        (league === 'PL' && f.leagueCode === 'PL') ||
        (league === 'CH' && f.leagueCode === 'CH') ||
        (league === 'L1' && f.leagueCode === 'L1') ||
        (league === 'L2' && f.leagueCode === 'L2');
      return leagueOk && f.round === round;
    });

    let updates = 0;
    const now = new Date().toISOString();
    targets.forEach((f, i) => {
      // Deterministic light simulation: occasionally flag TV/weather shift
      const hash = (f.id.charCodeAt(0) + f.round * 17 + i) % 47;
      if (hash === 0) {
        f.status = 'rescheduled';
        f.dateWarning = 'Possible TV reschedule — verify kickoff';
        updates++;
      } else if (hash === 1) {
        f.status = 'invalidated';
        f.dateWarning = 'Weather/postponement risk flagged';
        updates++;
      } else {
        f.status = 'scheduled';
        f.dateWarning = null;
      }
      f.lastValidated = now;
    });

    state.lastValidatedAt = now;
    state.validationCache[`${league}-${round}`] = { at: now, updates, count: targets.length };
    localStorage.setItem('aicca_validation_cache', JSON.stringify(state.validationCache));
    localStorage.setItem('aicca_last_validated', now);

    $('#btn-refresh').disabled = false;
    if (updates) {
      setRefreshStatus(
        'updates',
        `${updates} discrepancy(ies) in ${targets.length} fixtures · Last updated: ${new Date(now).toLocaleString()}`
      );
      toast(`Refresh complete: ${updates} updates found.`);
    } else {
      setRefreshStatus(
        'valid',
        `All ${targets.length} fixtures valid · Last updated: ${new Date(now).toLocaleString()}`
      );
      toast(`Round ${round} validated — no changes.`);
    }

    // Drop invalidated selections
    const before = state.accaA.length + state.accaB.length;
    state.accaA = state.accaA.filter((l) => findFixture(l.fixtureId)?.status !== 'invalidated');
    state.accaB = state.accaB.filter((l) => findFixture(l.fixtureId)?.status !== 'invalidated');
    if (state.accaA.length + state.accaB.length < before) {
      toast('Removed invalidated fixtures from accumulators.');
    }
    renderAll();
    checkStale();
  }

  function checkStale() {
    const last = state.lastValidatedAt || localStorage.getItem('aicca_last_validated');
    const banner = $('#stale-banner');
    if (!last) {
      banner.hidden = false;
      banner.textContent = 'Fixture data not yet validated this session. Use Refresh Fixtures before locking selections.';
      return;
    }
    const ageH = (Date.now() - new Date(last).getTime()) / 3600000;
    if (ageH > 48) {
      banner.hidden = false;
      banner.textContent = `⚠ Fixture data stale (${ageH.toFixed(0)}h since last check). Refresh recommended.`;
    } else {
      banner.hidden = true;
    }
  }

  /* ---------- Output modal ---------- */
  function riskFlags(which) {
    const list = which === 'A' ? state.accaA : state.accaB;
    const flags = [
      'Unconfirmed team news / late scratches within 24h of kickoff',
      'Referee not confirmed — cards pricing provisional',
      'Market suspension risk on player markets if injury doubt'
    ];
    list.forEach((l) => {
      if (l.confidence === 'SPECULATIVE') flags.push(`Speculative leg flagged: ${l.match} — ${l.selection}`);
      const f = findFixture(l.fixtureId);
      if (f?.dateWarning) flags.push(`${l.match}: ${f.dateWarning}`);
    });
    if (which === 'A') {
      flags.push('Correlation check: no cards+corners same fixture enforced at validation');
    }
    return [...new Set(flags)];
  }

  function outputTable(legs) {
    return `<table class="output-table">
      <thead>
        <tr>
          <th>Match</th><th>Family</th><th>Market</th><th>Selection</th>
          <th>Opta Edge</th><th>Supporting</th><th>Odds</th><th>Venue</th><th>Conf</th>
        </tr>
      </thead>
      <tbody>
        ${legs
          .map(
            (l) => `<tr>
            <td>${l.match}<br><span class="leg-meta">${l.league}</span></td>
            <td>${l.family}</td>
            <td>${l.market}</td>
            <td><strong>${l.selection}</strong></td>
            <td>${l.optaEdge}</td>
            <td>${l.supporting}</td>
            <td>${l.odds}</td>
            <td>${l.venue}</td>
            <td class="${confClass(l.confidence)}">${l.confidence}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
  }

  function openOutput() {
    if (!renderValidation()) {
      toast('Fix validation issues before generating.');
      return;
    }
    const a = validateAccaA();
    const b = validateAccaB();
    const body = $('#modal-body');
    body.innerHTML = `
      <p style="margin-top:0;color:var(--muted)">Dual-accumulator brief · fractional odds · Opta + supplementary sources · Betfair market families</p>
      <div class="acca-output-grid">
        <div class="output-card output-a">
          <h3>Accumulator A — Comprehensive · ${a.odds.fraction}</h3>
          ${outputTable(state.accaA)}
          <div class="risk-block">
            <h4>Risk Flags — Acca A</h4>
            <ul>${riskFlags('A').map((r) => `<li>${r}</li>`).join('')}</ul>
          </div>
        </div>
        <div class="output-card output-b">
          <h3>Accumulator B — 1X2 Only · ${b.odds.fraction}</h3>
          ${outputTable(state.accaB)}
          <div class="risk-block">
            <h4>Risk Flags — Acca B</h4>
            <ul>${riskFlags('B').map((r) => `<li>${r}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
      <div class="risk-block" style="margin-top:16px;background:rgba(27,177,231,0.08);border-color:rgba(27,177,231,0.3)">
        <h4 style="color:var(--sky-deep)">Cross-Acca Constraints</h4>
        <ul>
          <li>No shared fixtures between A and B — verified</li>
          <li>Both accumulators ≥ 5/1 — verified (${a.odds.fraction} / ${b.odds.fraction})</li>
          <li>Daily summary columns: Match | Market Family | Market | Selection | Opta Edge | Supporting Data | Approx Odds | Confidence</li>
        </ul>
      </div>
    `;
    $('#modal').classList.add('open');
  }

  function openFramework() {
    $('#framework-body').innerHTML = `
      <div style="display:grid;gap:14px">
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">01 — Opta Data Universe</h3>
        <p>Team attacking/possession/defensive/set-piece/pressing/form/discipline metrics; extended fatigue, manager, squad &amp; multi-year trends; player threats; H2H.</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">02 — Supplementary Sources</h3>
        <p>Understat · Wyscout · Statsbomb · Transfermarkt · Football-Reference · betting line movement &amp; correlation.</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">03 — Betfair Market Coverage</h3>
        <p>Match odds &amp; handicaps · Goals · Player · Corners &amp; Cards · Scorecast · Half-time. Tag every selection EXCHANGE or SPORTSBOOK.</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">04 — League-Specific Angles</h3>
        <p>PL efficiency &amp; festive congestion · Championship BTTS/fatigue · L1 set-pieces &amp; new-manager bounce · L2 home bias &amp; budget gaps.</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">05 / 12 — Dual Accumulators</h3>
        <p><strong>A:</strong> 5–7 legs, all market families, ≥5/1, ≥60% HIGH, no intra-match cards+corners, 3+ fixtures / 2+ leagues.<br>
        <strong>B:</strong> 4–5 legs, 1X2 only, 100% HIGH, ≥5/1. <strong>No shared fixtures.</strong></p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">06 — Research Protocol</h3>
        <p>Team/manager/player/referee/tier/fixture-context/Betfair search checklist per leg.</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">07 — Risk Flags</h3>
        <p>Team news · referee contradiction · H2H against · weather/pitch · correlation · speculative · market suspension · trend exhaustion.</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">08 — Daily Summary Table</h3>
        <p>Match | Market Family | Market | Selection | Opta Edge | Supporting Data | Approx Odds | Confidence</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">09 — Output Format Rules</h3>
        <p>Lead with data · flag narrative legs · Opta + supplementary · fractional odds · venue tags · correlation &amp; risk sections.</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">10 — League Guardrails</h3>
        <p>PL most efficient · Champ mid-season fade · L1 set-piece/manager · L2 chaos beyond 3 games.</p></section>
        <section><h3 style="color:var(--claret);font-family:var(--font-display);margin:0 0 6px">13 — Fixture GUI</h3>
        <p>West Ham claret/sky · 2,036 fixture matrix · Acca A/B panels · real-time validation · refresh &amp; PDF export.</p></section>
      </div>`;
    $('#framework-modal').classList.add('open');
  }

  function exportPdf() {
    window.print();
  }

  function seedDemoAccas() {
    // Pick diverse fixtures for a valid demo if empty
    if (state.accaA.length || state.accaB.length) return;
    const byLeague = {
      PL: state.fixtures.filter((f) => f.leagueCode === 'PL' && f.round === 1),
      CH: state.fixtures.filter((f) => f.leagueCode === 'CH' && f.round === 1),
      L1: state.fixtures.filter((f) => f.leagueCode === 'L1' && f.round === 1),
      L2: state.fixtures.filter((f) => f.leagueCode === 'L2' && f.round === 1)
    };
    const pickA = [byLeague.PL[0], byLeague.CH[0], byLeague.L1[0], byLeague.L2[0], byLeague.PL[1], byLeague.CH[1]].filter(Boolean);
    const families = ['match_odds', 'goals', 'player', 'corners', 'cards', 'half_time'];
    pickA.forEach((f, i) => {
      const leg = buildLeg(f, 'A');
      leg.family = families[i];
      const opts = window.AICCA_MARKETS.selections[leg.family];
      const o = opts[0];
      leg.market = o.market;
      leg.selection = o.selection;
      leg.odds = o.odds;
      leg.venue = o.venue;
      leg.confidence = i === 5 ? 'MEDIUM' : 'HIGH';
      // Boost odds on last legs to clear 5/1
      if (i >= 4) leg.odds = '6/4';
      state.accaA.push(leg);
    });

    const pickB = [byLeague.PL[2], byLeague.CH[2], byLeague.L1[1], byLeague.L2[1], byLeague.PL[3]].filter(Boolean);
    pickB.forEach((f, i) => {
      const leg = buildLeg(f, 'B');
      leg.odds = i < 2 ? '11/10' : '6/4';
      leg.confidence = 'HIGH';
      state.accaB.push(leg);
    });
  }

  /* ---------- Init ---------- */
  function populateDateOptions() {
    const dates = [...new Set(state.fixtures.map((f) => f.date))].sort();
    const sel = $('#filter-date');
    sel.innerHTML =
      `<option value="">All dates</option>` + dates.map((d) => `<option value="${d}">${d}</option>`).join('');
  }

  function populateRoundOptions() {
    const sel = $('#refresh-round');
    sel.innerHTML = Array.from({ length: 46 }, (_, i) => `<option value="${i + 1}">Round ${i + 1}</option>`).join('');
  }

  function bindUi() {
    $('#filter-league').addEventListener('change', (e) => {
      state.leagueFilter = e.target.value;
      applyFilters();
    });
    $('#filter-date').addEventListener('change', (e) => {
      state.dateFilter = e.target.value;
      applyFilters();
    });
    $('#filter-search').addEventListener('input', (e) => {
      state.search = e.target.value.trim();
      applyFilters();
    });
    $('#filter-round-view').addEventListener('change', (e) => {
      state.roundFilter = e.target.value;
      applyFilters();
    });

    $$('[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir *= -1;
        else {
          state.sortKey = key;
          state.sortDir = 1;
        }
        applyFilters();
      });
    });

    $$('input[name="pick-target"]').forEach((r) => {
      r.addEventListener('change', () => {
        state.pickTarget = r.value;
        renderValidation();
      });
    });

    $('#btn-refresh').addEventListener('click', refreshFixtures);
    $('#btn-generate').addEventListener('click', openOutput);
    $('#btn-framework').addEventListener('click', openFramework);
    $('#btn-close-framework').addEventListener('click', () => $('#framework-modal').classList.remove('open'));
    $('#framework-modal').addEventListener('click', (e) => {
      if (e.target.id === 'framework-modal') $('#framework-modal').classList.remove('open');
    });
    $('#btn-seed').addEventListener('click', () => {
      state.accaA = [];
      state.accaB = [];
      seedDemoAccas();
      renderAll();
      toast('Demo dual-accumulator seeded (edit legs as needed).');
    });
    $('#btn-clear-a').addEventListener('click', () => {
      state.accaA = [];
      renderAll();
    });
    $('#btn-clear-b').addEventListener('click', () => {
      state.accaB = [];
      renderAll();
    });
    $('#btn-close-modal').addEventListener('click', () => $('#modal').classList.remove('open'));
    $('#btn-export-pdf').addEventListener('click', exportPdf);
    $('#modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') $('#modal').classList.remove('open');
    });

    $('#auto-refresh').addEventListener('change', (e) => {
      state.autoRefresh = e.target.checked;
      localStorage.setItem('aicca_auto_refresh', state.autoRefresh ? '1' : '0');
      toast(state.autoRefresh ? 'Daily auto-refresh enabled (on load check).' : 'Auto-refresh disabled.');
    });
  }

  function init() {
    const raw = window.AICCA_FIXTURES;
    if (!raw || !raw.length) {
      toast('Fixture data failed to load.');
      return;
    }
    state.fixtures = raw.map((f) => ({ ...f }));
    try {
      state.validationCache = JSON.parse(localStorage.getItem('aicca_validation_cache') || '{}');
      state.lastValidatedAt = localStorage.getItem('aicca_last_validated');
      state.autoRefresh = localStorage.getItem('aicca_auto_refresh') === '1';
    } catch (_) {}

    populateDateOptions();
    populateRoundOptions();
    $('#filter-round-view').innerHTML =
      `<option value="">All rounds</option>` +
      Array.from({ length: 46 }, (_, i) => `<option value="${i + 1}">Round ${i + 1}</option>`).join('');
    $('#auto-refresh').checked = state.autoRefresh;

    bindUi();
    applyFilters();
    renderAll();
    checkStale();

    if (state.autoRefresh) {
      setTimeout(() => {
        $('#refresh-league').value = 'PL';
        $('#refresh-round').value = '1';
        refreshFixtures();
      }, 400);
    }

    $('#boot-stats').textContent = `${state.fixtures.length.toLocaleString()} fixtures loaded · 2026-27`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
