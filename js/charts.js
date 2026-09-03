// charts.js: Highcharts drawing (visible-satellite chart, DOP chart, skyplot),
// ported from the original GNSS-Radar.html to Highcharts 11

let nsatChart = null;
let dopChart = null;
let skyChart = null;

// reproduce the Highcharts v4 default look of the original version
// (v11 defaults to a Helvetica-based font)
Highcharts.setOptions({
    chart: {
        style: {
            fontFamily: '"Lucida Grande", "Lucida Sans Unicode", Arial, Helvetica, sans-serif'
        }
    }
});

function timeCategories(times, utcoffset) {
    const cat = [];
    for (let i = 0; i < times.length; i++) {
        cat[i] = Highcharts.dateFormat('%H:%M', times[i].getTime() - utcoffset * 60 * 1000);
    }
    return cat;
}

// stacked column chart of the number of visible satellites over time
// onEpochClick(timeIndex) is called when a bar is clicked
function drawNsatChart(nsatplts, times, utcoffset, tind, visstate, onEpochClick) {
    const options = {
        chart: {
            type: 'column',
            renderTo: 'nsat'
        },
        accessibility: { enabled: false },
        credits: { enabled: false },
        title: { text: '' },
        subtitle: { text: '' },
        xAxis: {
            gridLineWidth: 0,
            tickmarkPlacement: 'on',
            categories: timeCategories(times, utcoffset)
        },
        yAxis: {
            gridLineWidth: 0,
            min: 0,
            title: { text: 'Number of satellite' },
            stackLabels: {
                enabled: true,
                style: { fontWeight: 'bold', color: 'gray', textOutline: 'none' }
            }
        },
        legend: { enabled: false },
        tooltip: {
            formatter: function () {
                return this.point.category + '<br/>' +
                    '<b>' + this.series.name + ': ' + this.y + '</b>';
            },
            positioner: function () {
                return { x: 50, y: 50 };
            }
        },
        exporting: {
            scale: 1,
            sourceHeight: 400,
            sourceWidth: 800,
            filename: 'nsat'
        },
        plotOptions: {
            column: {
                stacking: 'normal',
                pointPadding: 0,
                groupPadding: 0,
                borderWidth: 0,
                point: {
                    events: {
                        click: function () { onEpochClick(this.x); }
                    }
                }
            }
        },
        series: SYSTEMS.map(sys => ({
            name: sys.legend,
            color: sys.colBar,
            visible: visstate[sys.id],
            data: nsatplts[sys.id]
        }))
    };

    if (nsatChart) nsatChart.destroy();
    nsatChart = new Highcharts.Chart(options);
    highlightNsatBar(tind, tind);
}

// darken the bars of the selected time index
// (hidden series have no points in Highcharts, hence the length check)
function highlightNsatBar(oldTind, newTind) {
    SYSTEMS.forEach((sys, i) => {
        const data = nsatChart.series[i].data;
        if (data.length === 0) return;
        data[oldTind].update({ color: sys.colBar }, true, false);
        data[newTind].update({ color: sys.colBarDark }, true, false);
    });
}

const DOPS = ['hdop', 'vdop', 'pdop', 'gdop'];

// line chart of HDOP/VDOP/PDOP/GDOP over time; series 4-7 are single-point
// marker series highlighting the current epoch
function drawDopChart(dopplts, times, utcoffset, tind, onEpochClick) {
    const dotSeries = DOPS.map((dop, i) => ({
        type: 'line',
        name: dop.toUpperCase(),
        color: SYSTEMS[i].colBar,
        showInLegend: false,
        data: [{
            x: tind,
            y: dopplts[dop][tind],
            marker: {
                enabled: true,
                radius: 6,
                states: { hover: { enabled: false } }
            }
        }]
    }));

    const options = {
        chart: {
            animation: false,
            type: 'line',
            renderTo: 'dop'
        },
        accessibility: { enabled: false },
        credits: { enabled: false },
        title: { text: '' },
        legend: {
            align: 'left',
            verticalAlign: 'top',
            floating: true,
            x: 30,
            y: 0
        },
        xAxis: {
            gridLineWidth: 1,
            gridLineDashStyle: 'dot',
            tickmarkPlacement: 'on',
            categories: timeCategories(times, utcoffset)
        },
        yAxis: {
            lineWidth: 1,
            tickWidth: 1,
            gridLineDashStyle: 'dot',
            tickmarkPlacement: 'on',
            min: 0,
            title: { enabled: false }
        },
        tooltip: {
            crosshairs: true,
            hideDelay: 0,
            formatter: function () {
                return this.point.category + '<br/>' +
                    '<b>' + this.series.name + ': ' + this.y.toFixed(2) + '</b>';
            }
        },
        exporting: {
            scale: 1,
            sourceHeight: 400,
            sourceWidth: 800,
            filename: 'dop'
        },
        plotOptions: {
            series: {
                animation: false,
                lineWidth: 3,
                marker: { symbol: 'circle', enabled: false },
                events: {
                    legendItemClick: function () { return false; }
                },
                point: {
                    events: {
                        click: function () { onEpochClick(this.x); }
                    }
                }
            }
        },
        series: DOPS.map((dop, i) => ({
            type: 'line',
            name: dop.toUpperCase(),
            color: SYSTEMS[i].colBar,
            data: dopplts[dop]
        })).concat(dotSeries)
    };

    if (dopChart) dopChart.destroy();
    dopChart = new Highcharts.Chart(options);
}

// move the current-epoch marker dots of the DOP chart
function highlightDopEpoch(tind) {
    DOPS.forEach((dop, i) => {
        dopChart.series[4 + i].data[0].update(
            { x: tind, y: dopChart.series[i].data[tind].y }, true, false);
    });
}

// polar bubble skyplot (system toggling lives in the toolbar legend,
// so the chart legend is disabled)
function drawSkyChart(skyplts, visstate) {
    const labels = {
        '0': 'N', '45': 'NE', '90': 'E', '135': 'SE',
        '180': 'S', '225': 'SW', '270': 'W', '315': 'NW'
    };

    const options = {
        chart: {
            renderTo: 'sky',
            polar: true
        },
        accessibility: { enabled: false },
        credits: { enabled: false },
        legend: { enabled: false },
        title: { text: '' },
        subtitle: { text: '' },
        tooltip: {
            pointFormat: 'PRN: <b>{point.name}</b><br>EL: <b>{point.y}</b>deg<br>AZ: <b>{point.x}</b>deg',
            hideDelay: 0
        },
        pane: {
            startAngle: 0,
            endAngle: 360
        },
        xAxis: {
            tickInterval: 45,
            min: 0,
            max: 360,
            labels: {
                formatter: function () { return labels[this.value]; },
                style: { fontSize: 'medium' }
            }
        },
        yAxis: {
            min: 0,
            max: 90,
            minorTickInterval: 10,
            tickInterval: 30,
            reversed: true,
            labels: { enabled: false }
        },
        exporting: {
            scale: 1,
            sourceHeight: 600,
            sourceWidth: 600,
            filename: 'skyplot'
        },
        plotOptions: {
            bubble: {
                minSize: 28,
                maxSize: 28,
                dataLabels: {
                    enabled: true,
                    formatter: function () { return shortLabel(this.point.name); },
                    inside: true,
                    align: 'center',
                    verticalAlign: 'middle',
                    // keep labels centered even near the pane edge
                    crop: false,
                    overflow: 'allow',
                    style: {
                        fontWeight: 'bold',
                        fontSize: 'small',
                        color: '#ffffff',
                        textOutline: '1px contrast'
                    },
                    allowOverlap: true
                },
                tooltip: {
                    followPointer: false,
                    followTouchMove: false,
                    hideDelay: 0
                }
            }
        },
        series: SYSTEMS.map(sys => ({
            type: 'bubble',
            color: sys.color,
            pointPlacement: 'between',
            name: sys.legend,
            visible: visstate[sys.id],
            data: skyplts[sys.id]
        }))
    };

    if (skyChart) skyChart.destroy();
    skyChart = new Highcharts.Chart(options);
}
