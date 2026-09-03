// map.js: Leaflet map (ESRI World Imagery), satellite markers, ground tracks
// and the observer marker. Satellite icons are drawn as L.divIcon (colored
// circle + PRN label) instead of the per-PRN PNG icons of the original site,
// so new satellites and PRN reassignments need no image maintenance.

let map;
let obsMarker;
const satMarkers = {}; // sysId -> [L.marker]
const satTracks = {};  // sysId -> [L.polyline]

function initMap(lat, lon, onObserverMoved) {
    // default: standard map, switchable to satellite imagery
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    });
    map = L.map('map', { worldCopyJump: true, minZoom: 1, layers: [osm] }).setView([lat, lon], 3);
    L.control.layers({ 'Map': osm, 'Satellite': esri }).addTo(map);

    obsMarker = L.marker([lat, lon], {
        draggable: true,
        zIndexOffset: 1000,
        icon: L.icon({
            iconUrl: 'icon/rangerstation.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            shadowUrl: 'icon/rangerstation.shadow.png',
            shadowSize: [59, 32],
            shadowAnchor: [16, 32],
            tooltipAnchor: [0, -32]
        })
    }).addTo(map);
    setObserverTooltip(lat, lon);

    obsMarker.on('dragend', function (ev) {
        const p = ev.target.getLatLng().wrap();
        ev.target.setLatLng(p);
        setObserverTooltip(p.lat, p.lng);
        map.panTo(p);
        onObserverMoved(p.lat, p.lng);
    });

    // keep Leaflet in sync with the responsive layout
    window.addEventListener('resize', function () { map.invalidateSize(); });
}

function setObserverPos(lat, lon) {
    obsMarker.setLatLng([lat, lon]);
    setObserverTooltip(lat, lon);
    map.panTo([lat, lon]);
}

function setObserverTooltip(lat, lon) {
    obsMarker.bindTooltip(
        'Observer (Drag and drop me!)<br>Lat: ' + lat.toFixed(3) + '<br>Lon: ' + lon.toFixed(3),
        { direction: 'top' });
}

// 26x26 colored circle with the PRN label, same look as the original
// per-PRN marker icons (gps5.png etc.) but drawn in the browser
function satDivIcon(sys, label) {
    const text = shortLabel(label);
    const fontSize = text.length <= 2 ? 12 : 10;
    return L.divIcon({
        className: '',
        html: '<div class="satmarker" style="background:' + sys.colBar +
            ';border:1px solid ' + sys.color +
            ';font-size:' + fontSize + 'px">' + text + '</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        tooltipAnchor: [0, -13]
    });
}

// one marker + one ground-track polyline per satellite (created once)
function createSatMarkers(satsBySys) {
    for (const sys of SYSTEMS) {
        satMarkers[sys.id] = satsBySys[sys.id].map(sat =>
            L.marker([0, 0], { icon: satDivIcon(sys, sat.label), keyboard: false })
                .bindTooltip('', { direction: 'top' }));
        satTracks[sys.id] = satsBySys[sys.id].map(() =>
            L.polyline([], { color: sys.color, opacity: 0.4, weight: 3, interactive: false }));
    }
}

// ground track of satellite i: unwrap longitudes so the line does not jump
// across the antimeridian
function trackPath(llhs, sysId, i, ntimes) {
    const path = [];
    let prev = null;
    let shift = 0;
    for (let t = 0; t < ntimes; t++) {
        const llh = llhs[sysId][t][i];
        if (!llh) continue;
        let lon = llh.lon + shift;
        if (prev !== null) {
            while (lon - prev > 180) { lon -= 360; shift -= 360; }
            while (lon - prev < -180) { lon += 360; shift += 360; }
        }
        prev = lon;
        path.push([llh.lat, lon]);
    }
    return path;
}

// place markers/tracks for time index tind and apply visibility
function updateSatMarkers(satsBySys, llhs, tind, ntimes, visstate) {
    for (const sys of SYSTEMS) {
        const sats = satsBySys[sys.id];
        for (let i = 0; i < sats.length; i++) {
            const marker = satMarkers[sys.id][i];
            const track = satTracks[sys.id][i];
            const llh = llhs[sys.id][tind][i];
            if (llh && sats[i].view && visstate[sys.id]) {
                marker.setLatLng([llh.lat, llh.lon]);
                marker.setTooltipContent(
                    sats[i].name + '<br>PRN: ' + sats[i].label +
                    '<br>Lat: ' + llh.lat.toFixed(2) + '<br>Lon: ' + llh.lon.toFixed(2));
                track.setLatLngs(trackPath(llhs, sys.id, i, ntimes));
                if (!map.hasLayer(marker)) marker.addTo(map);
                if (!map.hasLayer(track)) track.addTo(map);
            } else {
                if (map.hasLayer(marker)) map.removeLayer(marker);
                if (map.hasLayer(track)) map.removeLayer(track);
            }
        }
    }
}
