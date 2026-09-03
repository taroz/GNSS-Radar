GNSS-Radar
===============================================================================

<https://www.taroz.net/GNSS-Radar/>

Author
-------------------------------------------------------------------------------
Taro Suzuki  
E-Mail: <gnsssdrlib@gmail.com>  
HP: <http://www.taroz.net>

Overview
-------------------------------------------------------------------------------
"GNSS-Radar" is a web application to show the current GNSS constellation
(GPS / GLONASS / Galileo / BeiDou / QZSS / NavIC(IRNSS) / SBAS) at a
specified location. It shows:

* Sub-satellite points and ground tracks on a world map (drag the observer
  marker to change the location; switch between map and satellite imagery)
* A sky plot (azimuth/elevation) with PRN labels such as `G5`, `R10`, `E23`, `C45`
* The number of visible satellites over time
* HDOP/VDOP/PDOP/GDOP over time
* Click a bar of the satellite-number chart or a point of the DOP chart to
  change the displayed epoch
* The toolbar sets date/time, location and elevation mask; each system can be
  toggled in the legend, and GPS (ALL/L2C/L5), GLONASS (ALL/M/K) and
  BeiDou (ALL/II/III) can be filtered by signal/generation

You can bookmark the URL to quickly access the application.

Options
-------------------------------------------------------------------------------
* Set the observer location by latitude and longitude (the unit is degree).
    * URL+?lat=xxx&lon=xxx (default: lat=35.7&lon=139.8 (Tokyo))

* Set the elevation mask angle (the unit is degree).
    * URL+?elemask=xxx (default: elemask=10)

* Set the time offset from now (the unit is hour).
    * URL+?offhr=xxx (default: offhr=0)

* Set the time interval of the simulation (the unit is minutes).
    * URL+?tint=xxx (default: tint=15)

* Set the number of epochs of the simulation.
    * URL+?ntimes=xxx (default: ntimes=24, 24*15min=6hour, max: 200)

* These options are started with "?" and can be combined by "&".

How it works
-------------------------------------------------------------------------------
Everything runs in the browser; there is no server-side code.

* TLEs are fetched directly from [CelesTrak](https://celestrak.org/)
  (groups: gps-ops, glo-ops, galileo, beidou, irnss, sbas; QZSS satellites
  are included in the sbas group) and cached in localStorage for 2 hours.
* Satellite positions are computed with SGP4 (satellite.js).
* PRN numbers (including GLONASS slot numbers and Galileo E numbers, which are
  not contained in TLE names) and satellite block types (used by the
  signal-option filters) come from the tables in `js/prnmap.js`, which are
  generated automatically from the
  [IGS satellite metadata](https://files.igs.org/pub/station/general/igs_satellite_metadata.snx)
  by a weekly GitHub Actions workflow (`.github/workflows/update-prn.yml`).
  No manual maintenance is required.
  Satellites without a currently assigned PRN in the IGS metadata
  (retired or commissioning satellites) are not displayed.
* To regenerate `js/prnmap.js` yourself (e.g. when hosting on your own server
  without GitHub Actions), run the generator manually or from cron;
  it only needs Python 3 (standard library):

      python .github/scripts/update_prn.py

Development
-------------------------------------------------------------------------------
Serve the repository root with any HTTP server and open it in a browser
(opening index.html as a local file does not work because of fetch):

    python -m http.server 8000
    # -> http://localhost:8000/

Acknowledgments
-------------------------------------------------------------------------------
"GNSS-Radar" uses the following libraries and data:

* Leaflet: <https://leafletjs.com/> (map, with OpenStreetMap and
  Esri World Imagery tiles)
* Highcharts: <https://www.highcharts.com/>
* satellite.js: <https://github.com/shashwatak/satellite-js>
* TLE (Two Line Element) is downloaded from CelesTrak (<https://celestrak.org/>).
* PRN assignments are generated from the IGS satellite metadata (<https://igs.org/mgex/metadata/>).
