// satdata.js: constellation definitions, TLE download (CelesTrak) and PRN labeling
// PRN labels come from the PRNMAP table in js/prnmap.js (NORAD -> "G5"/"R10"/
// "E23"/"C45"/"Q194"), generated from the IGS satellite metadata by
// .github/scripts/update_prn.py (run weekly by .github/workflows/update-prn.yml).
// Satellites not in the table fall back to parsing the TLE name.

// legend/legendOps follow the toolbar of the original GNSS-Radar.html:
// short name shown in the legend and the signal-option filters per system
const SYSTEMS = [
    {
        id: 'gps', name: 'GPS', legend: 'GPS', letter: 'G', group: 'gps-ops',
        color: '#008000', colBar: 'rgba(0,128,0,0.5)', colBarDark: 'rgba(0,78,0,0.8)',
        options: ['ALL', 'L2C', 'L5']
    },
    {
        id: 'glo', name: 'GLONASS', legend: 'GLO', letter: 'R', group: 'glo-ops',
        color: '#FFAA00', colBar: 'rgba(255,170,0,0.5)', colBarDark: 'rgba(225,140,0,0.8)',
        options: ['ALL', 'M', 'K']
    },
    {
        id: 'gal', name: 'Galileo', legend: 'GAL', letter: 'E', group: 'galileo',
        color: '#FF00FF', colBar: 'rgba(255,0,255,0.5)', colBarDark: 'rgba(205,0,205,0.8)',
        options: null
    },
    {
        id: 'bds', name: 'BeiDou', legend: 'BDS', letter: 'C', group: 'beidou',
        color: '#FF0000', colBar: 'rgba(255,0,0,0.5)', colBarDark: 'rgba(205,0,0,0.8)',
        options: ['ALL', 'II', 'III']
    },
    {
        id: 'qzs', name: 'QZSS', legend: 'QZS', letter: 'Q', group: null, // extracted from the sbas group
        color: '#0000FF', colBar: 'rgba(0,0,255,0.5)', colBarDark: 'rgba(0,0,205,0.8)',
        options: null
    },
    {
        id: 'irns', name: 'NavIC', legend: 'IRNS', letter: 'I', group: 'irnss',
        color: '#662D91', colBar: 'rgba(102,45,145,0.5)', colBarDark: 'rgba(82,25,125,0.8)',
        options: null
    },
    {
        id: 'sbs', name: 'SBAS', legend: 'SBS', letter: 'S', group: 'sbas',
        color: '#008080', colBar: 'rgba(0,128,128,0.5)', colBarDark: 'rgba(0,100,100,0.8)',
        options: null
    },
];

const TLE_GROUPS = ['gps-ops', 'glo-ops', 'galileo', 'beidou', 'irnss', 'sbas'];
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=';
const TLE_CACHE_TTL = 2 * 60 * 60 * 1000; // CelesTrak GP data is updated ~every 2h

// download TLEs for all systems and return { satsBySys, errors }
// satsBySys[sysId] = [{ name, norad, label, block, view, satrec }, ...]
async function loadSatData() {
    const prnmap = (typeof PRNMAP === 'undefined') ? {} : PRNMAP;
    const blockmap = (typeof BLOCKMAP === 'undefined') ? {} : BLOCKMAP;
    const havePrnMap = Object.keys(prnmap).length > 0;

    const results = await Promise.allSettled(TLE_GROUPS.map(fetchTleGroup));

    const satsBySys = {};
    SYSTEMS.forEach(sys => satsBySys[sys.id] = []);
    const seen = new Set();
    const errors = [];

    results.forEach((res, i) => {
        if (res.status === 'rejected') {
            errors.push(TLE_GROUPS[i]);
            return;
        }
        for (const tle of parseTle(res.value)) {
            const sysId = classifyTle(TLE_GROUPS[i], tle.name);
            if (!sysId || seen.has(tle.norad)) continue;
            const label = satLabel(sysId, tle.name, tle.norad, prnmap, havePrnMap);
            if (!label) continue; // e.g. retired SBAS satellites without PRN
            let satrec;
            try {
                satrec = satellite.twoline2satrec(tle.line1, tle.line2);
            } catch (e) {
                continue;
            }
            seen.add(tle.norad);
            satsBySys[sysId].push({
                name: tle.name, norad: tle.norad, label: label,
                block: blockmap[tle.norad] || '', view: true, satrec: satrec
            });
        }
    });

    // sort by PRN number for stable tooltips/labels
    SYSTEMS.forEach(sys => satsBySys[sys.id].sort((a, b) =>
        Number(a.label.replace(/\D/g, '')) - Number(b.label.replace(/\D/g, ''))));

    if (errors.length === TLE_GROUPS.length) throw new Error('all TLE downloads failed');
    return { satsBySys: satsBySys, errors: errors };
}

// fetch one CelesTrak group with a localStorage cache (fall back to stale cache on failure)
async function fetchTleGroup(group) {
    const key = 'gnssradar_tle_' + group;
    const cached = readCache(key);
    if (cached && Date.now() - cached.t < TLE_CACHE_TTL) return cached.text;
    try {
        const res = await fetch(TLE_URL + group);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        if (!/^1 /m.test(text)) throw new Error('unexpected response');
        writeCache(key, { t: Date.now(), text: text });
        return text;
    } catch (e) {
        if (cached) return cached.text; // stale is better than nothing
        throw e;
    }
}

function readCache(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function writeCache(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}

// parse TLE text into [{ name, norad, line1, line2 }, ...]
function parseTle(text) {
    const lines = text.split('\n').map(s => s.replace(/\s+$/, '')).filter(s => s.length > 0);
    const tles = [];
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].substring(0, 2) === '1 ' && lines[i + 1].substring(0, 2) === '2 ') {
            tles.push({
                name: i > 0 ? lines[i - 1].trim() : '',
                norad: noradFromTle(lines[i]),
                line1: lines[i],
                line2: lines[i + 1]
            });
            i++;
        }
    }
    return tles;
}

// catalog number from TLE line 1 (columns 3-7), decoding the Alpha-5 scheme
// used for NORAD IDs >= 100000 (e.g. "A0270" -> 100270)
function noradFromTle(line1) {
    const raw = line1.substring(2, 7).trim();
    const c = raw.charAt(0);
    if (c >= '0' && c <= '9') return String(parseInt(raw, 10));
    const idx = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.indexOf(c.toUpperCase());
    if (idx < 0) return raw;
    return String((idx + 10) * 10000 + parseInt(raw.substring(1), 10));
}

// map a CelesTrak group + satellite name to a system id
// QZSS has no dedicated group and is distributed in the sbas group;
// BDSBAS satellites in the sbas group are dropped (they are in the beidou group)
function classifyTle(group, name) {
    if (group === 'sbas') {
        if (name.indexOf('QZS') === 0) return 'qzs';
        if (name.indexOf('BEIDOU') === 0) return null;
        return 'sbs';
    }
    return { 'gps-ops': 'gps', 'glo-ops': 'glo', 'galileo': 'gal', 'beidou': 'bds', 'irnss': 'irns' }[group];
}

// display label for the skyplot bubbles and map markers: drop the system
// letter when the PRN number has 3+ digits (Q194 -> 194, S136 -> 136) so the
// text fits inside the circle; tooltips keep the full label
function shortLabel(label) {
    const digits = label.replace(/\D/g, '');
    return digits.length >= 3 ? digits : label;
}

// signal-option filter of the toolbar: set sat.view from the selected option
// using the IGS block type (GPS-IIR-M/GPS-IIF/GPS-IIIA, GLO-M/GLO-K1B/GLO-K2,
// BDS-2G/BDS-3M-CAST, ...). Satellites with an unknown block stay visible
// only for "ALL".
function applySignalFilter(sysId, option, sats) {
    for (const sat of sats) {
        switch (sysId + ':' + option) {
            case 'gps:L2C': // IIR-M and later broadcast L2C
                sat.view = /^GPS-(IIR-M|IIF|III)/.test(sat.block);
                break;
            case 'gps:L5': // IIF and later broadcast L5
                sat.view = /^GPS-(IIF|III)/.test(sat.block);
                break;
            case 'glo:M':
                sat.view = /^GLO(-M)?$|^GLO-M\+/.test(sat.block);
                break;
            case 'glo:K':
                sat.view = /^GLO-K/.test(sat.block);
                break;
            case 'bds:II':
                sat.view = /^BDS-2/.test(sat.block);
                break;
            case 'bds:III':
                sat.view = /^BDS-3/.test(sat.block);
                break;
            default: // ALL
                sat.view = true;
        }
    }
}

// PRN label ("G5", "R10", "E23", "C45", "Q194", "S136")
// The IGS map is authoritative for GPS/GLONASS/Galileo/BeiDou/QZSS: satellites
// without a current PRN there are not broadcasting (retired or commissioning),
// so they are dropped (PRNs get reassigned, e.g. the 2026 BeiDou renumbering,
// and TLE names keep the stale PRN). TLE-name parsing is used for SBAS (not in
// the IGS file) and as a fallback when data/prn.json could not be loaded.
function satLabel(sysId, name, norad, prnmap, havePrnMap) {
    const fromMap = prnmap[norad];
    if (fromMap) return fromMap;
    if (havePrnMap && sysId !== 'sbs') return null;
    // fallback: parse the TLE name (a trailing "?" marks SVN-based labels that
    // are NOT the broadcast PRN/slot)
    let m;
    switch (sysId) {
        case 'gps':
            m = name.match(/PRN (\d+)/);
            return m ? 'G' + Number(m[1]) : null;
        case 'glo': // name contains the GLONASS vehicle number (7xx/8xx), not the slot
            m = name.match(/\((\d{3})/);
            return m ? 'R' + m[1] + '?' : null;
        case 'gal': // name contains the GSAT (SVN) number, not the E number
            m = name.match(/GSAT0?(\d+)/);
            return m ? 'E' + m[1] + '?' : null;
        case 'bds':
            m = name.match(/\(C(\d+)\)/) || name.match(/PRN (\d+)/);
            return m ? 'C' + Number(m[1]) : null;
        case 'qzs':
            m = name.match(/PRN (\d+)/);
            return m ? 'Q' + Number(m[1]) : null;
        case 'sbs':
            m = name.match(/PRN (\d+)/);
            return m ? 'S' + Number(m[1]) : null;
    }
    return null;
}
