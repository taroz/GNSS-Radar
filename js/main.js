// main.js: URL parameters, application state, toolbar and event wiring

let orglat, orglon, observerGd;
let elemask, offhr, tint, ntimes, utcoffset;
let times = [];
let tind = 0;
let satsBySys = {};
let llhs = {};  // llhs[sysId][t][i]  sub-satellite points (observer independent)
let azels = {}; // azels[sysId][t][i] azimuth/elevation from the observer
let skyplts = {};
let nsatplts = {};
let dopplts = {};
const visstate = {}; // sysId -> bool (system toggled in the toolbar legend)

// numeric URL query parameter with default (same keys as the original version:
// lat, lon, elemask, offhr, tint, ntimes)
function getKey(key, def) {
    const s = new URLSearchParams(location.search).get(key);
    if (s === null || s === '') return def;
    const v = Number(s);
    return isNaN(v) ? def : v;
}

function setObserver(lat, lon) {
    orglat = lat;
    orglon = lon;
    observerGd = { latitude: lat * D2R, longitude: lon * D2R, height: 0 };
}

// generate the epoch list starting at t0
function setTimes(t0) {
    times = [];
    for (let i = 0; i < ntimes; i++) times.push(new Date(t0.getTime() + i * tint));
    const now = new Date();
    const diffday = Math.abs(now.getTime() - t0.getTime()) / (1000 * 3600 * 24);
    if (diffday > 10) {
        alert(now.toLocaleDateString() + ' TLE is used to compute satellite locations of ' +
            t0.toLocaleDateString());
    }
}

async function init() {
    SYSTEMS.forEach(sys => visstate[sys.id] = true);

    // default: 15 min interval x 24 epochs = 6 hours
    ntimes = Math.max(1, Math.min(getKey('ntimes', 24), 200));
    tint = getKey('tint', 15) * 60 * 1000; // ms
    elemask = getKey('elemask', 10);
    offhr = getKey('offhr', 0);
    setObserver(getKey('lat', 35.7), getKey('lon', 139.8)); // default: Tokyo

    const t = new Date();
    utcoffset = t.getTimezoneOffset(); // min
    t.setHours(t.getHours() + offhr);
    setTimes(t);

    initToolbar();
    initMap(orglat, orglon, onObserverMoved);

    try {
        const res = await loadSatData();
        satsBySys = res.satsBySys;
        if (res.errors.length > 0) {
            showError('TLE download failed for: ' + res.errors.join(', ') + ' (shown without them)');
        }
    } catch (e) {
        document.getElementById('loading').style.display = 'none';
        showError('Failed to load TLE data from CelesTrak. Please reload later.');
        return;
    }

    createSatMarkers(satsBySys);
    redrawAll();
    document.getElementById('loading').style.display = 'none';
}

// full recompute + redraw (initial draw, update button, signal filter change)
function redrawAll() {
    computeAllLLH();
    computeAllAzEl();
    genPlotData();
    updateSatMarkers(satsBySys, llhs, tind, ntimes, visstate);
    drawSkyChart(skyplts, visstate);
    drawNsatChart(nsatplts, times, utcoffset, tind, visstate, onEpochClick);
    drawDopChart(dopplts, times, utcoffset, tind, onEpochClick);
    updateInputs();
    updateLegend();
}

// sub-satellite points for all times (independent of observer)
function computeAllLLH() {
    SYSTEMS.forEach(sys => llhs[sys.id] = []);
    for (let t = 0; t < ntimes; t++) {
        const gmst = satellite.gstime(times[t]);
        for (const sys of SYSTEMS) {
            llhs[sys.id][t] = satsBySys[sys.id].map(sat => computeSatLLH(sat, times[t], gmst));
        }
    }
}

// az/el for all times from the current observer position
function computeAllAzEl() {
    SYSTEMS.forEach(sys => azels[sys.id] = []);
    for (let t = 0; t < ntimes; t++) {
        for (const sys of SYSTEMS) {
            azels[sys.id][t] = llhs[sys.id][t].map(llh => llh ? computeAzEl(observerGd, llh) : null);
        }
    }
}

// az/el of one epoch with the signal filter (sat.view) applied
function azelsAt(t) {
    const out = {};
    SYSTEMS.forEach(sys => {
        out[sys.id] = azels[sys.id][t].map((azel, i) => satsBySys[sys.id][i].view ? azel : null);
    });
    return out;
}

// skyplot / nsat / dop plot data from the current az/els
function genPlotData() {
    nsatplts = {};
    for (const sys of SYSTEMS) {
        nsatplts[sys.id] = [];
        for (let t = 0; t < ntimes; t++) {
            let nsat = 0;
            azels[sys.id][t].forEach((azel, i) => {
                if (satsBySys[sys.id][i].view && azel && azel.el > elemask) nsat++;
            });
            nsatplts[sys.id].push({ x: t, y: nsat });
        }
    }
    dopplts = { hdop: [], vdop: [], pdop: [], gdop: [] };
    for (let t = 0; t < ntimes; t++) {
        const dop = computeDop(azelsAt(t), visstate, elemask);
        DOPS.forEach(d => dopplts[d].push(dop[d]));
    }
    genSkyPlotData(tind);
}

function genSkyPlotData(t) {
    skyplts = {};
    for (const sys of SYSTEMS) {
        skyplts[sys.id] = [];
        satsBySys[sys.id].forEach((sat, i) => {
            const azel = azels[sys.id][t][i];
            if (sat.view && azel && azel.el > elemask) {
                skyplts[sys.id].push({
                    name: sat.label,
                    x: Math.round(azel.az * 10) / 10,
                    y: Math.round(azel.el * 10) / 10
                });
            }
        });
    }
}

// ---------------------------------------------------------------- toolbar

function pad2(n) { return ('0' + n).slice(-2); }

// value for <input type="datetime-local">
function datetimeValue(t) {
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()) +
        'T' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
}

function updateInputs() {
    document.getElementById('tb_lat').value = orglat.toFixed(4);
    document.getElementById('tb_lon').value = orglon.toFixed(4);
    document.getElementById('tb_elmask').value = elemask.toFixed(0);
    document.getElementById('datetimepicker').value = datetimeValue(times[tind]);
}

// build the legend columns (toggle + signal-option select per system)
function initToolbar() {
    const legend = document.getElementById('tb_legend');
    for (const sys of SYSTEMS) {
        const col = document.createElement('div');
        col.className = 'legcol';
        col.id = 'leg-' + sys.id;

        const toggle = document.createElement('div');
        toggle.className = 'legtoggle';
        toggle.innerHTML = '<span class="legdot"></span><a href="#"></a>';
        toggle.addEventListener('click', function (ev) {
            ev.preventDefault();
            onSysToggle(sys.id);
        });
        col.appendChild(toggle);

        if (sys.options) {
            const sel = document.createElement('select');
            sys.options.forEach(op => {
                const o = document.createElement('option');
                o.textContent = op;
                sel.appendChild(o);
            });
            sel.addEventListener('change', function () {
                sel.disabled = true;
                applySignalFilter(sys.id, sel.value, satsBySys[sys.id]);
                genPlotData();
                updateSatMarkers(satsBySys, llhs, tind, ntimes, visstate);
                drawSkyChart(skyplts, visstate);
                drawNsatChart(nsatplts, times, utcoffset, tind, visstate, onEpochClick);
                drawDopChart(dopplts, times, utcoffset, tind, onEpochClick);
                updateLegend();
                sel.disabled = false;
            });
            col.appendChild(sel);
        }
        legend.appendChild(col);
    }

    document.getElementById('b_update').addEventListener('click', onUpdateClick);
}

// legend counts (number of visible satellites at the current epoch) and colors
function updateLegend() {
    let nall = 0;
    for (const sys of SYSTEMS) {
        const cell = document.getElementById('leg-' + sys.id);
        const n = nsatplts[sys.id][tind].y;
        const dot = cell.querySelector('.legdot');
        dot.style.background = sys.color;
        dot.style.opacity = visstate[sys.id] ? 1 : 0.2;
        const a = cell.querySelector('a');
        a.textContent = sys.legend + '(' + n + ')';
        a.className = visstate[sys.id] ? 'vis' : 'invis';
        if (visstate[sys.id]) nall += n;
    }
    document.getElementById('nsatall').textContent = 'N=' + nall;
}

// ------------------------------------------------------------------ events

// update button: read date/time, lat/lon and elevation mask, recompute all
function onUpdateClick() {
    const btn = document.getElementById('b_update');
    btn.disabled = true;
    elemask = Number(document.getElementById('tb_elmask').value) || 0;
    setObserver(
        Number(document.getElementById('tb_lat').value) || 0,
        Number(document.getElementById('tb_lon').value) || 0);
    const t = new Date(document.getElementById('datetimepicker').value);
    setTimes(isNaN(t.getTime()) ? new Date() : t);
    tind = 0;
    redrawAll();
    setObserverPos(orglat, orglon);
    btn.disabled = false;
}

// click on a bar of the nsat chart or a point of the DOP chart:
// switch the displayed epoch
function onEpochClick(x) {
    highlightNsatBar(tind, x);
    tind = x;
    highlightDopEpoch(tind);
    updateSatMarkers(satsBySys, llhs, tind, ntimes, visstate);
    genSkyPlotData(tind);
    drawSkyChart(skyplts, visstate);
    document.getElementById('datetimepicker').value = datetimeValue(times[tind]);
    updateLegend();
}

// observer marker was dragged: recompute az/el for all times
function onObserverMoved(lat, lon) {
    setObserver(lat, lon);
    computeAllAzEl();
    genPlotData();
    updateSatMarkers(satsBySys, llhs, tind, ntimes, visstate);
    drawSkyChart(skyplts, visstate);
    drawNsatChart(nsatplts, times, utcoffset, tind, visstate, onEpochClick);
    drawDopChart(dopplts, times, utcoffset, tind, onEpochClick);
    updateInputs();
    updateLegend();
}

// system toggled from the toolbar legend: sync all charts and the map
function onSysToggle(sysId) {
    visstate[sysId] = !visstate[sysId];
    const i = SYSTEMS.findIndex(sys => sys.id === sysId);
    skyChart.series[i][visstate[sysId] ? 'show' : 'hide']();
    nsatChart.series[i][visstate[sysId] ? 'show' : 'hide']();
    updateSatMarkers(satsBySys, llhs, tind, ntimes, visstate);
    // DOP depends on the enabled systems
    dopplts = { hdop: [], vdop: [], pdop: [], gdop: [] };
    for (let t = 0; t < ntimes; t++) {
        const dop = computeDop(azelsAt(t), visstate, elemask);
        DOPS.forEach(d => dopplts[d].push(dop[d]));
    }
    drawDopChart(dopplts, times, utcoffset, tind, onEpochClick);
    updateLegend();
}

function showError(msg) {
    const bar = document.getElementById('errbar');
    bar.textContent = msg;
    bar.style.display = 'block';
}

init();
