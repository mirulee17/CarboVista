// ================= LOAD STORED RESULT =================
const data = JSON.parse(localStorage.getItem("analysisResult"));
const aoiBounds = JSON.parse(localStorage.getItem("aoiBounds"));

if (!data || !data.geojson) {
    alert("No analysis data found. Please run analysis again.");
    window.location.href = "AOI.html";
}

// ================= MAP INITIALISATION =================
const map = L.map("map");

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// ================= UNIT CONVERSION =================
// tc/ha → kg C / m²
function tcHaToKgM2(acd_tc_ha) {
    return acd_tc_ha * 0.1;
}

// ================= COLOR SCALE (kg C / m²) =================
function getColor(acd_tc_ha) {
    const v = tcHaToKgM2(acd_tc_ha);

    return v > 8  ? "#7f0000" :
           v > 6  ? "#b30000" :
           v > 4  ? "#e34a33" :
           v > 3  ? "#fc8d59" :
           v > 2  ? "#fdbb84" :
           v > 1  ? "#fdd49e" :
                    "#fee8c8";
}

// ================= KPI STATS =================
const stats = data.stats;

document.getElementById("mean").textContent =
    stats.mean_acd.toFixed(2);

document.getElementById("min").textContent =
    stats.min_acd.toFixed(2);

document.getElementById("max").textContent =
    stats.max_acd.toFixed(2);

document.getElementById("area").textContent =
    stats.area_ha.toFixed(2);

document.getElementById("total").textContent =
    stats.total_carbon.toFixed(2);

// ================= GEOJSON LAYER =================
const geoLayer = L.geoJSON(data.geojson, {
    pointToLayer: (feature, latlng) => {
        const acd = feature.properties.acd;

        return L.circleMarker(latlng, {
            radius: 4,
            fillColor: getColor(acd),
            color: null,
            fillOpacity: 0.85
        });
    }
}).addTo(map);

// ================= FIT MAP =================
if (aoiBounds) {
    map.fitBounds(aoiBounds);
} else {
    map.fitBounds(geoLayer.getBounds());
}

// ================= SCALE BAR (METRIC – MALAYSIA) =================
L.control.scale({
    metric: true,
    imperial: false,
    position: "bottomleft"
}).addTo(map);
