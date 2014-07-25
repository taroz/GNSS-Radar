GNSS-Radar
===============================================================================

Author
-------------------------------------------------------------------------------
Taro Suzuki  
E-Mail: <gnsssdrlib@gmail.com>
HP: <http://www.taroz.net>

Overview
-------------------------------------------------------------------------------
"GNSS-Radar" is a web application to show the current GNSS constellation at a specified location. You can bookmark the following URL to quickly access the application.
<http://www.taroz.net/GNSS-Radar.html>

Options
-------------------------------------------------------------------------------
* Set the observer location by latitude and longitude (the unit is degree).
    * ULR+?lat=xxx&lon=xxx (default: lat=35.7&lon=139.8 (Tokyo))
    * e.g. <http://www.taroz.net/GNSS-Radar.html?lat=-37.8&lon=145>

* Set the elevation mask angle when computing the sky plot (the unit is degree).
    * ULR+?elemask=xxx (default: elemask=10)
    * e.g. <http://www.taroz.net/GNSS-Radar.html?elemask=45>

* Set the time offset when computing the sky plot (the unit is hour).
    * ULR+?offhr=xxx (default: offhr=0)
    * e.g. <http://www.taroz.net/GNSS-Radar.html?offhr=12>

* Set the time interval when computing the sky plot (the unit is minutes).
    * ULR+?tint=xxx (default: tint=30)
    * e.g. <http://www.taroz.net/GNSS-Radar.html?tint=5>

* Set the number of times when computing the sky plot.
    * ULR+?ntimes=xxx (default: tint=24, 24*30min=12hour)
    * e.g. <http://www.taroz.net/GNSS-Radar.html?ntimes=48>
    
* These options are started with "?" and can be combined by "&".

Acknowledgments
-------------------------------------------------------------------------------
"GNSS-Radar" uses the following libraries:

* satellite.js: https://github.com/shashwatak/satellite-js
* highcharts.js: http://www.highcharts.com/
* Sylvester.js: http://sylvester.jcoglan.com/
* TLE (Two Line Element) is downloaded from celestrak (<http://www.celestrak.com/>).
