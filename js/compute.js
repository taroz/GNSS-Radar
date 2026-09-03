// compute.js: SGP4 orbit propagation (satellite.js v5), az/el and DOP

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function wrapLon(lon) {
    return ((lon + 540) % 360) - 180;
}

// sub-satellite point (geodetic) at date; gmst is passed in so it is
// computed once per epoch instead of once per satellite
function computeSatLLH(sat, date, gmst) {
    let pv;
    try {
        pv = satellite.propagate(sat.satrec, date);
    } catch (e) {
        return null;
    }
    if (!pv || !pv.position || typeof pv.position !== 'object') return null;
    const gd = satellite.eciToGeodetic(pv.position, gmst);
    return {
        lat: satellite.degreesLat(gd.latitude),
        lon: wrapLon(satellite.degreesLong(gd.longitude)),
        gd: gd // radians; kept for az/el computation
    };
}

// azimuth/elevation [deg] of a satellite seen from the observer
// observerGd = { latitude, longitude } in radians, height in km
function computeAzEl(observerGd, llh) {
    const ecf = satellite.geodeticToEcf(llh.gd);
    const look = satellite.ecfToLookAngles(observerGd, ecf);
    let az = look.azimuth * R2D;
    az = ((az % 360) + 360) % 360;
    return { az: az, el: look.elevation * R2D };
}

// HDOP/VDOP/PDOP/GDOP from all visible satellites of the enabled systems
// azelsAtT[sysId] = [{az, el} | null, ...]
function computeDop(azelsAtT, visstate, elemask) {
    const obs = [];
    for (const sys of SYSTEMS) {
        if (!visstate[sys.id]) continue;
        for (const azel of azelsAtT[sys.id]) {
            if (azel && azel.el > elemask) obs.push(azel);
        }
    }
    if (obs.length < 4) return { hdop: 0, vdop: 0, pdop: 0, gdop: 0 };

    // accumulate G'G directly (4x4), G rows = [E, N, U, 1]
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (const azel of obs) {
        const az = azel.az * D2R;
        const el = azel.el * D2R;
        const g = [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el), 1];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) A[i][j] += g[i] * g[j];
        }
    }
    const D = invert4(A);
    if (!D) return { hdop: 0, vdop: 0, pdop: 0, gdop: 0 };
    return {
        hdop: Math.sqrt(D[0][0] + D[1][1]),
        vdop: Math.sqrt(D[2][2]),
        pdop: Math.sqrt(D[0][0] + D[1][1] + D[2][2]),
        gdop: Math.sqrt(D[0][0] + D[1][1] + D[2][2] + D[3][3])
    };
}

// 4x4 matrix inversion by Gauss-Jordan elimination with partial pivoting
function invert4(M) {
    // augmented matrix [M | I]
    const a = M.map((row, i) => row.concat([0, 0, 0, 0].map((_, j) => (i === j ? 1 : 0))));
    for (let k = 0; k < 4; k++) {
        let piv = k;
        for (let i = k + 1; i < 4; i++) {
            if (Math.abs(a[i][k]) > Math.abs(a[piv][k])) piv = i;
        }
        if (Math.abs(a[piv][k]) < 1e-12) return null; // singular
        if (piv !== k) {
            const tmp = a[k]; a[k] = a[piv]; a[piv] = tmp;
        }
        const d = a[k][k];
        for (let j = k; j < 8; j++) a[k][j] /= d;
        for (let i = 0; i < 4; i++) {
            if (i === k) continue;
            const f = a[i][k];
            if (f === 0) continue;
            for (let j = k; j < 8; j++) a[i][j] -= f * a[k][j];
        }
    }
    return a.map(row => row.slice(4));
}
