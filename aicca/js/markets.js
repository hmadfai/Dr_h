/* AICCA market catalogues and Opta edge helpers */
window.AICCA_MARKETS = {
  families: {
    A: [
      { id: 'match_odds', label: 'Match Odds', required: true },
      { id: 'goals', label: 'Goals', required: true },
      { id: 'player', label: 'Player Markets', required: true },
      { id: 'corners', label: 'Corners', required: true },
      { id: 'cards', label: 'Cards', required: true },
      { id: 'half_time', label: 'Half-Time Markets', required: true },
      { id: 'scorecast', label: 'Scorecast / Correct Score', required: false }
    ],
    B: [
      { id: 'match_odds', label: 'Match Result (1X2)', required: true }
    ]
  },
  selections: {
    match_odds: [
      { market: 'Match Result 1X2', selection: 'Home Win', odds: '11/10', venue: 'EXCHANGE' },
      { market: 'Match Result 1X2', selection: 'Away Win', odds: '6/4', venue: 'EXCHANGE' },
      { market: 'Match Result 1X2', selection: 'Draw', odds: '12/5', venue: 'SPORTSBOOK' },
      { market: 'Draw No Bet', selection: 'Home', odds: '4/6', venue: 'EXCHANGE' },
      { market: 'Double Chance', selection: '1X', odds: '2/5', venue: 'SPORTSBOOK' },
      { market: 'Asian Handicap', selection: 'Home -0.5', odds: '11/10', venue: 'EXCHANGE' },
      { market: 'Asian Handicap', selection: 'Away +0.5', odds: '5/6', venue: 'EXCHANGE' }
    ],
    goals: [
      { market: 'Over/Under 2.5', selection: 'Over 2.5 Goals', odds: '10/11', venue: 'EXCHANGE' },
      { market: 'Over/Under 2.5', selection: 'Under 2.5 Goals', odds: '11/10', venue: 'EXCHANGE' },
      { market: 'Over/Under 1.5', selection: 'Over 1.5 Goals', odds: '2/5', venue: 'SPORTSBOOK' },
      { market: 'Over/Under 3.5', selection: 'Over 3.5 Goals', odds: '9/4', venue: 'EXCHANGE' },
      { market: 'BTTS', selection: 'BTTS Yes', odds: '5/6', venue: 'EXCHANGE' },
      { market: 'BTTS', selection: 'BTTS No', odds: '11/10', venue: 'SPORTSBOOK' },
      { market: '1st Half O/U 0.5', selection: 'Over 0.5 1H Goals', odds: '8/13', venue: 'EXCHANGE' },
      { market: '2nd Half O/U 1.5', selection: 'Over 1.5 2H Goals', odds: '6/4', venue: 'EXCHANGE' }
    ],
    player: [
      { market: 'Anytime Goalscorer', selection: 'Home Lead Striker Anytime', odds: '6/4', venue: 'SPORTSBOOK' },
      { market: 'Anytime Goalscorer', selection: 'Away Lead Striker Anytime', odds: '2/1', venue: 'SPORTSBOOK' },
      { market: 'First Goalscorer', selection: 'Home Lead Striker First', odds: '4/1', venue: 'EXCHANGE' },
      { market: 'Player Shots on Target', selection: 'Home Creator 2+ SOT', odds: '11/8', venue: 'EXCHANGE' },
      { market: 'Player to be Carded', selection: 'Away Aggressive CB Carded', odds: '5/2', venue: 'SPORTSBOOK' },
      { market: 'Player Assist', selection: 'Home Key Creator Assist', odds: '3/1', venue: 'EXCHANGE' }
    ],
    corners: [
      { market: 'Total Corners', selection: 'Over 8.5 Corners', odds: '5/6', venue: 'EXCHANGE' },
      { market: 'Total Corners', selection: 'Over 9.5 Corners', odds: '11/10', venue: 'EXCHANGE' },
      { market: 'Total Corners', selection: 'Over 10.5 Corners', odds: '6/4', venue: 'SPORTSBOOK' },
      { market: 'Asian Handicap Corners', selection: 'Home -1.5 Corners', odds: '10/11', venue: 'EXCHANGE' },
      { market: 'Team Corners', selection: 'Home Over 4.5 Corners', odds: '5/6', venue: 'EXCHANGE' }
    ],
    cards: [
      { market: 'Total Bookings', selection: 'Over 3.5 Cards', odds: '8/11', venue: 'EXCHANGE' },
      { market: 'Total Bookings', selection: 'Over 4.5 Cards', odds: '6/5', venue: 'SPORTSBOOK' },
      { market: 'Total Bookings', selection: 'Over 5.5 Cards', odds: '9/4', venue: 'EXCHANGE' },
      { market: 'First Team Card', selection: 'Away First Card', odds: '11/10', venue: 'EXCHANGE' },
      { market: 'Team Bookings', selection: 'Home Over 1.5 Cards', odds: '5/6', venue: 'SPORTSBOOK' }
    ],
    half_time: [
      { market: 'Half-Time Result', selection: 'Home Leading HT', odds: '6/5', venue: 'EXCHANGE' },
      { market: 'Half-Time Result', selection: 'Draw HT', odds: '11/8', venue: 'SPORTSBOOK' },
      { market: 'HT/FT', selection: 'Home/Home', odds: '2/1', venue: 'EXCHANGE' },
      { market: '1st Half Goals', selection: 'Over 0.5 1H', odds: '8/13', venue: 'EXCHANGE' },
      { market: '1st Half Goals', selection: 'Over 1.5 1H', odds: '2/1', venue: 'SPORTSBOOK' }
    ],
    scorecast: [
      { market: 'Correct Score', selection: '2-1 Home', odds: '8/1', venue: 'EXCHANGE' },
      { market: 'Correct Score', selection: '2-0 Home', odds: '9/1', venue: 'SPORTSBOOK' },
      { market: 'Correct Score', selection: '1-1 Draw', odds: '13/2', venue: 'EXCHANGE' },
      { market: 'Scorecast', selection: 'Home Striker + 2-1', odds: '16/1', venue: 'SPORTSBOOK' }
    ],
    '1x2_only': [
      { market: 'Match Result 1X2', selection: 'Home Win', odds: '11/10', venue: 'EXCHANGE' },
      { market: 'Match Result 1X2', selection: 'Away Win', odds: '6/4', venue: 'EXCHANGE' },
      { market: 'Match Result 1X2', selection: 'Draw', odds: '12/5', venue: 'SPORTSBOOK' }
    ]
  }
};

window.AICCA_EDGES = {
  metrics: [
    'xG last 10 (home split)',
    'xGA seasonal',
    'PPDA pressing intensity',
    'Clean sheet % last 5',
    'Set-piece threat score',
    'BTTS frequency league-tier',
    'Away form PPG',
    'Corner conversion rate',
    'Fouls/cards per game',
    'First-goal-scored rate',
    'Field tilt %',
    'Big-chance conversion'
  ],
  sources: ['Opta', 'Understat', 'Wyscout', 'Statsbomb', 'Transfermarkt'],
  confidences: ['HIGH', 'MEDIUM', 'SPECULATIVE'],

  edgeFor(fixture, familyId) {
    const m = this.metrics[(fixture.round + familyId.length) % this.metrics.length];
    const s = this.sources[fixture.round % this.sources.length];
    const tierNote = {
      'Premier League': 'PL form more stable; market efficiency high',
      'Championship': 'Champ BTTS / fatigue angle',
      'League One': 'L1 set-piece & new-manager edge',
      'League Two': 'L2 extreme home bias / set-piece dominance'
    }[fixture.league];

    const map = {
      match_odds: `${fixture.home} home xG edge vs ${fixture.away} away xGA; ${m}`,
      goals: `Combined xG projection vs ${fixture.league} O/U baseline; ${m}`,
      player: `Top xG/90 threat identified; shot map + conversion (${s})`,
      corners: `Low PPDA / high press → elevated corner volume; ${m}`,
      cards: `Fouls/game + referee tendency proxy; ${m}`,
      half_time: `Opening-15 goal rate + high-press start pattern`,
      scorecast: `xG simulation modal scoreline + primary scorer`,
      '1x2_only': `${fixture.home} vs ${fixture.away}: form index + H2H directional edge`
    };

    return {
      optaEdge: map[familyId] || m,
      supporting: `${s} cross-check · ${tierNote}`,
      confidence: familyId === '1x2_only' || familyId === 'match_odds'
        ? 'HIGH'
        : this.confidences[(fixture.round + familyId.charCodeAt(0)) % 3]
    };
  }
};

/** Fractional odds helpers */
window.AICCA_ODDS = {
  parseFraction(frac) {
    if (!frac || typeof frac !== 'string') return null;
    const t = frac.trim();
    if (t.includes('/')) {
      const [a, b] = t.split('/').map(Number);
      if (!b) return null;
      return a / b + 1; // decimal including stake
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  },

  toFraction(decimal) {
    if (!decimal || decimal < 1) return '—';
    const profit = decimal - 1;
    if (profit >= 20) return `${Math.round(profit)}/1`;
    // Prefer common UK betting fractions
    const commons = [
      [1, 5], [2, 9], [1, 4], [2, 7], [1, 3], [4, 11], [2, 5], [4, 9],
      [1, 2], [8, 15], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [5, 6],
      [10, 11], [1, 1], [6, 5], [5, 4], [11, 8], [6, 4], [8, 5], [13, 8],
      [7, 4], [9, 5], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1],
      [10, 3], [4, 1], [9, 2], [5, 1], [11, 2], [6, 1], [7, 1], [8, 1], [10, 1], [12, 1], [16, 1], [20, 1]
    ];
    let best = commons[0];
    let bestErr = Infinity;
    for (const [n, d] of commons) {
      const err = Math.abs(profit - n / d);
      if (err < bestErr) {
        bestErr = err;
        best = [n, d];
      }
    }
    if (bestErr <= 0.06) return `${best[0]}/${best[1]}`;
    let bestN = 1, bestD = 1;
    bestErr = Infinity;
    for (let d = 1; d <= 40; d++) {
      const n = Math.round(profit * d);
      const err = Math.abs(profit - n / d);
      if (err < bestErr) {
        bestErr = err;
        bestN = n;
        bestD = d;
      }
    }
    if (bestN === 0) return '1/100';
    const g = (a, b) => (b ? g(b, a % b) : a);
    const d0 = g(bestN, bestD);
    return `${bestN / d0}/${bestD / d0}`;
  },

  combine(fracs) {
    let dec = 1;
    for (const f of fracs) {
      const d = this.parseFraction(f);
      if (!d) return { decimal: null, fraction: '—', ok: false };
      dec *= d;
    }
    return { decimal: dec, fraction: this.toFraction(dec), ok: dec >= 6 };
  }
};
