/* AICCA odds enrichment — Betfair Exchange baselines from football-data BFE* closers */
window.AICCA_ODDS_LIVE = (function () {
  /**
   * Historical exchange baselines baked into team profiles
   * (avg_exchange_odds_when_backed from BFEH/BFEA columns).
   */
  function baselineFor(teamName, side) {
    const t = window.AICCA_TEAM_STATS?.teams?.[teamName];
    if (!t) return null;
    const block = side === 'home' ? t.home : side === 'away' ? t.away : t.overall;
    return block?.avg_exchange_odds_when_backed || t.overall?.avg_exchange_odds_when_backed || null;
  }

  /** Blend model decimal with historical exchange price when available */
  function enrichDecimal(modelDecimal, home, away, selection) {
    let hist = null;
    if (/Home Win/i.test(selection)) hist = baselineFor(home, 'home');
    else if (/Away Win/i.test(selection)) hist = baselineFor(away, 'away');

    if (!hist || hist < 1.05) {
      return { decimal: modelDecimal, venue: 'EXCHANGE', note: 'Model price (no BFE baseline)' };
    }
    // 60% model / 40% historical closer — softens early-season uncertainty
    const blended = modelDecimal * 0.6 + hist * 0.4;
    return {
      decimal: blended,
      venue: 'EXCHANGE',
      note: `Blended model ${modelDecimal.toFixed(2)} + Betfair closer avg ${hist.toFixed(2)}`
    };
  }

  function applyToLeg(leg, fixture) {
    if (!leg || !fixture) return leg;
    if (leg.family !== 'match_odds' && leg.family !== '1x2_only') {
      leg.oddsNote = 'Market priced from Opta-proxy model';
      return leg;
    }
    const modelDec = leg.decimal || window.AICCA_ODDS.parseFraction(leg.odds);
    const enriched = enrichDecimal(modelDec, fixture.home, fixture.away, leg.selection);
    leg.decimal = Math.round(enriched.decimal * 1000) / 1000;
    leg.odds = window.AICCA_ODDS.toFraction(leg.decimal);
    leg.venue = enriched.venue;
    leg.supporting = `${leg.supporting} · ${enriched.note}`;
    leg.oddsNote = enriched.note;
    return leg;
  }

  /**
   * Optional: attempt The Odds API if window.AICCA_ODDS_API_KEY is set.
   * Without a key this is a no-op (documented for operators).
   */
  async function fetchLiveH2H(sportKey = 'soccer_epl') {
    const key = window.AICCA_ODDS_API_KEY;
    if (!key) return { ok: false, reason: 'No AICCA_ODDS_API_KEY configured' };
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${encodeURIComponent(key)}&regions=uk&markets=h2h&oddsFormat=decimal`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`odds api ${res.status}`);
      const data = await res.json();
      return { ok: true, events: data };
    } catch (err) {
      return { ok: false, reason: String(err.message || err) };
    }
  }

  return { enrichDecimal, applyToLeg, baselineFor, fetchLiveH2H };
})();
