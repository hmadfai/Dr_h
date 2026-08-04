/* AICCA live fixture refresh — ESPN + TheSportsDB (browser-side) */
window.AICCA_REFRESH = (function () {
  const LEAGUE_ESPN = {
    PL: 'eng.1',
    CH: 'eng.2',
    L1: 'eng.3',
    L2: 'eng.4',
    ALL: null
  };
  const LEAGUE_TSDB = {
    PL: 4328,
    CH: 4329,
    L1: 4396,
    L2: 4397
  };

  const NAME_ALIASES = {
    'Manchester United': 'Man Utd',
    'Man United': 'Man Utd',
    'Manchester City': 'Man City',
    'Tottenham Hotspur': 'Spurs',
    'Tottenham': 'Spurs',
    'Nottingham Forest': "Nott'm Forest",
    "Nott'm Forest": "Nott'm Forest",
    'Wolverhampton Wanderers': 'Wolverhampton Wanderers',
    'Wolves': 'Wolverhampton Wanderers',
    'West Ham United': 'West Ham United',
    'West Ham': 'West Ham United',
    'Newcastle United': 'Newcastle',
    'Leicester City': 'Leicester City',
    'Leeds United': 'Leeds',
    'Coventry City': 'Coventry',
    'Hull City': 'Hull',
    'Ipswich Town': 'Ipswich',
    'Brighton and Hove Albion': 'Brighton',
    'Brighton & Hove Albion': 'Brighton',
    'AFC Bournemouth': 'Bournemouth',
    'Queens Park Rangers': 'Queens Park Rangers',
    'QPR': 'Queens Park Rangers',
    'Sheffield Wednesday': 'Sheffield Wednesday',
    'West Bromwich Albion': 'West Bromwich Albion',
    'West Brom': 'West Bromwich Albion',
    'Birmingham City': 'Birmingham City',
    'Blackburn Rovers': 'Blackburn Rovers',
    'Bolton Wanderers': 'Bolton Wanderers',
    'Charlton Athletic': 'Charlton Athletic',
    'Derby County': 'Derby County',
    'Norwich City': 'Norwich City',
    'Preston North End': 'Preston North End',
    'Stoke City': 'Stoke City',
    'Swansea City': 'Swansea City',
    'Milton Keynes Dons': 'MK Dons',
    'MK Dons': 'MK Dons'
  };

  function stripNoise(name) {
    return name
      .toLowerCase()
      .replace(/\b(fc|afc|town|city|united|athletic|rovers|wanderers|county|albion|hotspur)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function norm(name) {
    if (!name) return '';
    const t = name.trim();
    return NAME_ALIASES[t] || t;
  }

  function matchKey(home, away) {
    return `${stripNoise(norm(home))}|${stripNoise(norm(away))}`;
  }

  async function fetchJson(url, opts = {}) {
    const timeoutMs = opts.timeoutMs || 12000;
    let timer;
    let signal = opts.signal;
    if (!signal && typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      timer = setTimeout(() => ctrl.abort(), timeoutMs);
      signal = ctrl.signal;
    }
    try {
      const res = await fetch(url, {
        signal,
        headers: { Accept: 'application/json', ...(opts.headers || {}) }
      });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** ESPN scoreboard for a YYYYMMDD date */
  async function espnDay(leagueCode, yyyymmdd) {
    const slug = LEAGUE_ESPN[leagueCode];
    if (!slug) return [];
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${yyyymmdd}&limit=50`;
    try {
      const data = await fetchJson(url);
      return (data.events || []).map((e) => {
        const comp = (e.competitions || [])[0] || {};
        const competitors = comp.competitors || [];
        const home = competitors.find((c) => c.homeAway === 'home');
        const away = competitors.find((c) => c.homeAway === 'away');
        const date = (e.date || '').slice(0, 10);
        return {
          source: 'ESPN',
          leagueCode,
          date,
          time: (e.date || '').slice(11, 16),
          home: home?.team?.displayName || home?.team?.shortDisplayName,
          away: away?.team?.displayName || away?.team?.shortDisplayName,
          venue: comp.venue?.fullName || null,
          status: e.status?.type?.name || e.status?.type?.description || 'scheduled',
          rawName: e.name
        };
      });
    } catch (err) {
      return [{ _error: String(err.message || err), source: 'ESPN', leagueCode }];
    }
  }

  /** TheSportsDB season events (free key may return a sample; still useful) */
  async function tsdbSeason(leagueCode, season = '2026-2027') {
    const id = LEAGUE_TSDB[leagueCode];
    if (!id) return [];
    try {
      const data = await fetchJson(
        `https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=${id}&s=${encodeURIComponent(season)}`
      );
      return (data.events || []).map((e) => ({
        source: 'TheSportsDB',
        leagueCode,
        date: e.dateEvent,
        time: (e.strTime || '').slice(0, 5),
        home: e.strHomeTeam,
        away: e.strAwayTeam,
        venue: e.strVenue || null,
        status: e.strStatus || 'scheduled',
        rawName: e.strEvent
      }));
    } catch (err) {
      return [{ _error: String(err.message || err), source: 'TheSportsDB', leagueCode }];
    }
  }

  async function tsdbDay(dateIso) {
    try {
      const data = await fetchJson(
        `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateIso}&s=Soccer`
      );
      return (data.events || [])
        .filter((e) => {
          const L = e.strLeague || '';
          return (
            L === 'English Premier League' ||
            L === 'English League Championship' ||
            L === 'English League 1' ||
            L === 'English League 2' ||
            L === 'English League One' ||
            L === 'English League Two'
          );
        })
        .map((e) => ({
          source: 'TheSportsDB-day',
          league: e.strLeague,
          date: e.dateEvent,
          time: (e.strTime || '').slice(0, 5),
          home: e.strHomeTeam,
          away: e.strAwayTeam,
          venue: e.strVenue || null,
          status: e.strStatus || 'scheduled',
          rawName: e.strEvent
        }));
    } catch (err) {
      return [{ _error: String(err.message || err), source: 'TheSportsDB-day' }];
    }
  }

  /**
   * Validate AICCA fixtures for a league/round against live sources.
   * Mutates fixture objects: status, venue, dateWarning, lastValidated, liveSources
   */
  async function validateRound(fixtures, { leagueCode = 'ALL', round = 1, onProgress } = {}) {
    const targets = fixtures.filter((f) => {
      const leagueOk = leagueCode === 'ALL' || f.leagueCode === leagueCode;
      return leagueOk && Number(f.round) === Number(round);
    });

    const dates = [...new Set(targets.map((f) => f.date))].sort();
    const leagues = leagueCode === 'ALL'
      ? [...new Set(targets.map((f) => f.leagueCode))]
      : [leagueCode];

    const remote = [];
    let step = 0;
    const totalSteps = dates.length * leagues.length + leagues.length;

    for (const lg of leagues) {
      onProgress?.({ phase: 'TheSportsDB season', league: lg, step: ++step, totalSteps });
      remote.push(...(await tsdbSeason(lg)));
    }

    for (const d of dates) {
      const ymd = d.replace(/-/g, '');
      for (const lg of leagues) {
        onProgress?.({ phase: 'ESPN scoreboard', date: d, league: lg, step: ++step, totalSteps });
        remote.push(...(await espnDay(lg, ymd)));
      }
      onProgress?.({ phase: 'TheSportsDB day', date: d, step, totalSteps });
      remote.push(...(await tsdbDay(d)));
    }

    const errors = remote.filter((r) => r && r._error);
    const live = remote.filter((r) => r && !r._error && r.home && r.away);

    const byPair = new Map();
    live.forEach((r) => {
      byPair.set(matchKey(r.home, r.away), r);
      // also try swapped alias keys already normalized in matchKey
    });

    const now = new Date().toISOString();
    let matched = 0;
    let updates = 0;
    let missing = 0;

    targets.forEach((f) => {
      const hit = byPair.get(matchKey(f.home, f.away));
      f.lastValidated = now;
      f.liveSources = [...new Set(live.map((x) => x.source))];

      if (!hit) {
        // If all remote sources errored, keep scheduled; else flag unverified
        if (live.length === 0 && errors.length) {
          f.status = 'scheduled';
          f.dateWarning = `Live sources unreachable (${errors.map((e) => e.source).join(', ')}); matrix retained`;
        } else {
          missing++;
          f.status = 'unverified';
          f.dateWarning = 'Not found in ESPN/TheSportsDB for this date — verify TV/weather schedule';
        }
        return;
      }

      matched++;
      const notes = [];
      if (hit.date && hit.date !== f.date) {
        notes.push(`Date moved ${f.date} → ${hit.date}`);
        f.date = hit.date;
        updates++;
        f.status = 'rescheduled';
      }
      if (hit.venue && f.venue && hit.venue !== f.venue) {
        notes.push(`Venue listed as ${hit.venue}`);
        f.venue = hit.venue;
        updates++;
      }
      if (/postpon|cancel|abandon/i.test(hit.status || '')) {
        f.status = 'invalidated';
        notes.push(`Source status: ${hit.status}`);
        updates++;
      } else if (f.status !== 'rescheduled') {
        f.status = 'scheduled';
      }
      f.dateWarning = notes.length ? notes.join('; ') : null;
      f.kickoffTime = hit.time || f.kickoffTime || null;
    });

    return {
      targets: targets.length,
      matched,
      updates,
      missing,
      liveCount: live.length,
      errors,
      validatedAt: now,
      sourcesUsed: [...new Set(live.map((x) => x.source).concat(errors.map((e) => e.source)))]
    };
  }

  return { validateRound, espnDay, tsdbSeason, tsdbDay, norm };
})();
