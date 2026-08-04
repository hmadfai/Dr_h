/* AICCA analysis engine — Opta-proxy metrics from team-stats + players */
window.AICCA_ANALYSIS = (function () {
  function team(name) {
    const db = window.AICCA_TEAM_STATS?.teams || {};
    return db[name] || null;
  }

  function players(name) {
    return (window.AICCA_PLAYERS || {})[name] || null;
  }

  function sideBlock(profile, isHome) {
    if (!profile) return null;
    if (isHome && profile.home) return profile.home;
    if (!isHome && profile.away) return profile.away;
    return profile.overall;
  }

  function confidenceFromEdge(edgeScore) {
    if (edgeScore >= 0.62) return 'HIGH';
    if (edgeScore >= 0.48) return 'MEDIUM';
    return 'SPECULATIVE';
  }

  function decimalToFraction(dec) {
    return window.AICCA_ODDS.toFraction(dec);
  }

  /** Implied 1X2 decimals from strength differential */
  function implied1x2(homeProf, awayProf) {
    const hs = homeProf?.strength ?? 50;
    const as_ = awayProf?.strength ?? 50;
    const hBlock = sideBlock(homeProf, true) || {};
    const aBlock = sideBlock(awayProf, false) || {};
    // Elo-ish win expectancy with home boost
    const diff = (hs - as_) / 100 + 0.12 + ((hBlock.ppg || 1.2) - (aBlock.ppg || 1.2)) * 0.08;
    let pHome = 1 / (1 + Math.exp(-diff * 3.2));
    let pAway = 1 / (1 + Math.exp(diff * 3.2));
    let pDraw = Math.max(0.18, 0.28 - Math.abs(diff) * 0.25);
    const sum = pHome + pDraw + pAway;
    pHome /= sum;
    pDraw /= sum;
    pAway /= sum;
    return {
      home: 1 / pHome,
      draw: 1 / pDraw,
      away: 1 / pAway,
      pHome,
      pDraw,
      pAway
    };
  }

  function goalsProjection(homeProf, awayProf) {
    const h = sideBlock(homeProf, true) || { xg_pg: 1.2, xga_pg: 1.2 };
    const a = sideBlock(awayProf, false) || { xg_pg: 1.1, xga_pg: 1.2 };
    const homeXg = (h.xg_pg + a.xga_pg) / 2;
    const awayXg = (a.xg_pg + h.xga_pg) / 2;
    const total = homeXg + awayXg;
    const btts = 1 / (1 + Math.exp(-(homeXg - 0.85) * 2)) * 1 / (1 + Math.exp(-(awayXg - 0.85) * 2));
    return { homeXg, awayXg, total, bttsProb: Math.min(0.82, Math.max(0.28, btts * 1.35)) };
  }

  function analyzeFixture(fixture) {
    const home = team(fixture.home);
    const away = team(fixture.away);
    const hp = players(fixture.home);
    const ap = players(fixture.away);
    const hOver = home?.overall || {};
    const aOver = away?.overall || {};
    const hHome = sideBlock(home, true) || hOver;
    const aAway = sideBlock(away, false) || aOver;
    const odds = implied1x2(home, away);
    const goals = goalsProjection(home, away);

    const cornersExp =
      ((hHome.corners_for_pg || 5) + (aAway.corners_ag_pg || 5) +
        (aAway.corners_for_pg || 4.5) + (hHome.corners_ag_pg || 5)) /
      2;
    const cardsExp = (hOver.yellows_pg || 1.8) + (aOver.yellows_pg || 1.8) + 0.35;

    const pressMismatch =
      (hHome.ppda_proxy || 11) < 9 && (aAway.ppda_proxy || 11) > 12
        ? 'Home intense press vs away passive build-up'
        : (aAway.ppda_proxy || 11) < 9
          ? 'Away high press travel risk'
          : 'Balanced pressing profiles';

    return {
      fixtureId: fixture.id,
      match: fixture.match,
      league: fixture.league,
      home: {
        profile: home,
        block: hHome,
        players: hp
      },
      away: {
        profile: away,
        block: aAway,
        players: ap
      },
      markets: {
        '1x2': odds,
        goals,
        cornersExp: round(cornersExp, 2),
        cardsExp: round(cardsExp, 2),
        htHomeProb: ((hHome.ht_lead_pct || 30) / 100) * 0.85
      },
      narrative: {
        pressMismatch,
        form: `Home form ${hHome.form_last5 || 'n/a'} · Away form ${aAway.form_last5 || 'n/a'}`,
        xgLine: `xG proxy H ${hHome.xg_pg ?? '—'} / A ${aAway.xg_pg ?? '—'} · xGA H ${hHome.xga_pg ?? '—'} / A ${aAway.xga_pg ?? '—'}`,
        setPieces: `Set-piece threat H ${hHome.set_piece_threat ?? '—'} · A ${aAway.set_piece_threat ?? '—'}`,
        sources: [
          ...(home?.sources || []),
          ...(away?.sources || []),
          'AICCA strength model'
        ]
      }
    };
  }

  function round(n, d) {
    const p = 10 ** d;
    return Math.round(n * p) / p;
  }

  /**
   * Build a priced leg suggestion for a market family using real metrics.
   */
  function suggestLeg(fixture, family, { forceHigh = false } = {}) {
    const a = analyzeFixture(fixture);
    const h = a.home.block || {};
    const aw = a.away.block || {};
    const hp = a.home.players;
    const ap = a.away.players;
    let market;
    let selection;
    let decimal;
    let optaEdge;
    let supporting;
    let edgeScore = 0.55;
    let venue = 'EXCHANGE';

    switch (family) {
      case 'match_odds':
      case '1x2_only': {
        const o = a.markets['1x2'];
        const pick = o.pHome >= o.pAway && o.pHome >= o.pDraw
          ? 'home'
          : o.pAway >= o.pDraw
            ? 'away'
            : 'draw';
        market = 'Match Result 1X2';
        if (pick === 'home') {
          selection = 'Home Win';
          decimal = o.home;
          edgeScore = o.pHome;
          optaEdge = `${fixture.home} home xG ${h.xg_pg} vs ${fixture.away} away xGA ${aw.xga_pg}; strength ${a.home.profile?.strength}/${a.away.profile?.strength}`;
        } else if (pick === 'away') {
          selection = 'Away Win';
          decimal = o.away;
          edgeScore = o.pAway;
          optaEdge = `${fixture.away} away xG ${aw.xg_pg} vs ${fixture.home} home xGA ${h.xga_pg}; PPDA ${aw.ppda_proxy}`;
        } else {
          selection = 'Draw';
          decimal = o.draw;
          edgeScore = o.pDraw;
          optaEdge = `Tight xG gap (${goalsGap(a)}); draw prior elevated`;
          venue = 'SPORTSBOOK';
        }
        supporting = `${a.narrative.form} · ${a.narrative.xgLine}`;
        break;
      }
      case 'goals': {
        const g = a.markets.goals;
        market = g.total >= 2.55 ? 'Over/Under 2.5' : g.bttsProb >= 0.55 ? 'BTTS' : 'Over/Under 2.5';
        if (market === 'BTTS') {
          selection = 'BTTS Yes';
          decimal = 1 / Math.max(0.35, g.bttsProb);
          edgeScore = g.bttsProb;
          optaEdge = `BTTS model ${Math.round(g.bttsProb * 100)}% · H xG ${g.homeXg.toFixed(2)} A xG ${g.awayXg.toFixed(2)} · H BTTS ${h.btts_pct}% A ${aw.btts_pct}%`;
        } else if (g.total >= 2.55) {
          selection = 'Over 2.5 Goals';
          const p = 1 / (1 + Math.exp(-(g.total - 2.5) * 1.6));
          decimal = 1 / p;
          edgeScore = p;
          optaEdge = `Projected goals ${g.total.toFixed(2)} from xG sum · O2.5 rates H ${h.over25_pct}% A ${aw.over25_pct}%`;
        } else {
          selection = 'Under 2.5 Goals';
          const p = 1 / (1 + Math.exp((g.total - 2.5) * 1.6));
          decimal = 1 / p;
          edgeScore = p;
          optaEdge = `Low xG sum ${g.total.toFixed(2)} · CS% H ${h.clean_sheet_pct} A ${aw.clean_sheet_pct}`;
        }
        supporting = `${a.narrative.pressMismatch} · sources: football-data Opta-proxy`;
        break;
      }
      case 'player': {
        const striker = hp?.topAttackers?.[0];
        market = 'Anytime Goalscorer';
        selection = `${striker?.name || fixture.home + ' Lead Striker'} Anytime`;
        const p = Math.min(0.55, Math.max(0.18, (striker?.xg90 || h.xg_pg * 0.35) * 0.85));
        decimal = 1 / p;
        edgeScore = p + 0.15;
        optaEdge = `xG/90 ${striker?.xg90 ?? 'n/a'} · team home xG ${h.xg_pg} · SOT/90 ${striker?.sot90 ?? h.sot_pg}`;
        supporting = `Penalty taker flag: ${hp?.penaltyTaker || 'unconfirmed'} · ${hp?.source || 'role model'}`;
        venue = 'SPORTSBOOK';
        break;
      }
      case 'corners': {
        market = 'Total Corners';
        const exp = a.markets.cornersExp;
        selection = exp >= 10.2 ? 'Over 10.5 Corners' : exp >= 9.2 ? 'Over 9.5 Corners' : 'Over 8.5 Corners';
        const line = selection.includes('10.5') ? 10.5 : selection.includes('9.5') ? 9.5 : 8.5;
        const p = 1 / (1 + Math.exp(-(exp - line) * 0.9));
        decimal = 1 / Math.max(0.35, p);
        edgeScore = p;
        optaEdge = `Corners exp ${exp} · H for ${h.corners_for_pg} / A ag ${aw.corners_ag_pg} · PPDA H ${h.ppda_proxy}`;
        supporting = a.narrative.pressMismatch;
        break;
      }
      case 'cards': {
        market = 'Total Bookings';
        const exp = a.markets.cardsExp;
        selection = exp >= 5.2 ? 'Over 5.5 Cards' : exp >= 4.3 ? 'Over 4.5 Cards' : 'Over 3.5 Cards';
        const line = selection.includes('5.5') ? 5.5 : selection.includes('4.5') ? 4.5 : 3.5;
        const p = 1 / (1 + Math.exp(-(exp - line) * 1.1));
        decimal = 1 / Math.max(0.35, p);
        edgeScore = p;
        optaEdge = `Cards exp ${exp.toFixed(2)} · yellows H ${h.yellows_pg} A ${aw.yellows_pg} · fouls H ${h.fouls_pg}`;
        supporting = `Card risk: ${ap?.cardRisks?.[0]?.name || 'away CB'} · league discipline baseline`;
        venue = 'SPORTSBOOK';
        break;
      }
      case 'half_time': {
        market = 'Half-Time Result';
        const p = a.markets.htHomeProb;
        if (p >= 0.34) {
          selection = 'Home Leading HT';
          decimal = 1 / Math.max(0.28, p);
          edgeScore = p + 0.2;
          optaEdge = `HT lead rate home ${h.ht_lead_pct}% · early press PPDA ${h.ppda_proxy}`;
        } else {
          selection = 'Over 0.5 1H';
          market = '1st Half Goals';
          const p1 = Math.min(0.78, 0.45 + a.markets.goals.total * 0.08);
          decimal = 1 / p1;
          edgeScore = p1;
          optaEdge = `1H over model from total xG ${goals.total.toFixed(2)}`;
        }
        supporting = a.narrative.form;
        break;
      }
      case 'scorecast': {
        market = 'Correct Score';
        const g = a.markets.goals;
        const hg = Math.max(1, Math.round(g.homeXg));
        const ag = Math.max(0, Math.round(g.awayXg));
        selection = `${hg}-${ag} Home`;
        decimal = 8 + Math.abs(hg - ag) * 2 + (seed(fixture.id) % 5);
        edgeScore = 0.42;
        optaEdge = `Modal score from xG H ${g.homeXg.toFixed(2)} A ${g.awayXg.toFixed(2)}`;
        supporting = `Attach scorer ${hp?.topAttackers?.[0]?.name || 'home striker'} for scorecast upgrade`;
        venue = 'EXCHANGE';
        break;
      }
      default: {
        market = 'Match Result 1X2';
        selection = 'Home Win';
        decimal = a.markets['1x2'].home;
        optaEdge = a.narrative.xgLine;
        supporting = a.narrative.form;
      }
    }

    let confidence = forceHigh ? 'HIGH' : confidenceFromEdge(edgeScore);
    if (forceHigh) confidence = 'HIGH';

    // Clamp crazy prices
    decimal = Math.min(Math.max(decimal, 1.15), 25);

    return {
      fixtureId: fixture.id,
      match: fixture.match,
      league: fixture.league,
      date: fixture.date,
      family: family === '1x2_only' ? '1x2_only' : family,
      market,
      selection,
      odds: decimalToFraction(decimal),
      decimal: round(decimal, 3),
      venue,
      confidence,
      optaEdge,
      supporting: `${supporting} · ${[...new Set(a.narrative.sources)].slice(0, 3).join(' + ')}`,
      analysis: a
    };
  }

  function goalsGap(a) {
    const g = a.markets.goals;
    return Math.abs(g.homeXg - g.awayXg).toFixed(2);
  }

  function seed(id) {
    let s = 0;
    for (let i = 0; i < id.length; i++) s += id.charCodeAt(i);
    return s;
  }

  return { analyzeFixture, suggestLeg, team, players, implied1x2, goalsProjection };
})();
