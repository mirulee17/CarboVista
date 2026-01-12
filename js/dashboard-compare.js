// =====================================================
// LOAD STORED DATA
// =====================================================
const analysisA = JSON.parse(localStorage.getItem("analysisA"));
const analysisB = JSON.parse(localStorage.getItem("analysisB"));
const meta = JSON.parse(localStorage.getItem("comparisonMeta"));
const aoiBounds = JSON.parse(localStorage.getItem("aoiBounds"));

if (!analysisA || !analysisB || !meta || !aoiBounds) {
    alert("Comparison data missing. Please rerun analysis.");
    window.location.href = "compareAOI.html";
    throw new Error("Missing comparison data");
}

// =====================================================
// HEADER TEXT
// =====================================================
document.getElementById("aoiAddress").textContent =
    analysisA.stats.aoi_address || "Unknown location";

document.getElementById("aoiArea").textContent =
    analysisA.stats.aoi_area_km2.toFixed(2);

document.getElementById("periodA").textContent =
    `${analysisA.stats.start_date} – ${analysisA.stats.end_date}`;

document.getElementById("periodB").textContent =
    `${analysisB.stats.start_date} – ${analysisB.stats.end_date}`;

document.getElementById("mapATitle").textContent =
    `Tree Carbon (kg C) ${analysisA.stats.start_date} – ${analysisA.stats.end_date}`;

document.getElementById("mapBTitle").textContent =
    `Tree Carbon (kg C) ${analysisB.stats.start_date} – ${analysisB.stats.end_date}`;

document.getElementById("labelA").textContent =
    `${analysisA.stats.start_date} – ${analysisA.stats.end_date}`;

document.getElementById("labelB").textContent =
    `${analysisB.stats.start_date} – ${analysisB.stats.end_date}`;

// =====================================================
// MAP INITIALISATION (SIDE-BY-SIDE)
// =====================================================
function initMap(mapId) {
    const map = L.map(mapId, { zoomControl: true });

    // --- Base layers ---
    const streetMap = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "&copy; OpenStreetMap contributors"
        }
    );

    const satelliteMap = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/" +
        "World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            attribution:
                "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
        }
    );

    // Default layer
    streetMap.addTo(map);

    // Layer toggle (per-map, independent)
    L.control.layers(
        {
            "Street Map": streetMap,
            "Satellite Map": satelliteMap
        },
        null,
        {
            position: "topright",
            collapsed: false
        }
    ).addTo(map);

    map.fitBounds(aoiBounds, { padding: [20, 20] });

    return map;
}


const mapA = initMap("mapA");
const mapB = initMap("mapB");

// =====================================================
// COLOR SCALE
// =====================================================
function getColor(carbonKg) {
    return carbonKg > 120 ? "#7f0000" :  // very high (dark red)
           carbonKg > 100 ? "#b30000" :
           carbonKg > 80  ? "#d73027" :
           carbonKg > 60  ? "#fc8d59" :
           carbonKg > 40  ? "#1a9850" :  // solid green (medium biomass)
           carbonKg > 20  ? "#a6d96a" :  // light green (low–medium)
           carbonKg > 10  ? "#f6e8a7" :  // light yellow
                            "#fdf5c9"; // very low biomass
}

function pointStyle(feature, latlng) {
    return L.circleMarker(latlng, {
        radius: 4,
        fillColor: getColor(feature.properties.carbon_kg),
        color: "#111",
        weight: 0.3,
        fillOpacity: 0.8
    });
}

function addAOIMask(mapInstance, bounds) {
    const outerBounds = [
        [-90, -180],
        [-90, 180],
        [90, 180],
        [90, -180]
    ];

    const hole = [
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
        [bounds.getSouthWest().lat, bounds.getNorthEast().lng],
        [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
        [bounds.getNorthEast().lat, bounds.getSouthWest().lng]
    ];

    L.polygon(
        [outerBounds, hole],
        {
            color: "#000",
            fillColor: "#000",
            fillOpacity: 0.55,   // slightly lighter for compare
            stroke: false,
            interactive: false
        }
    ).addTo(mapInstance);
}

// =====================================================
// LEGEND FACTORY (REUSABLE)
// =====================================================
function addLegend(mapInstance) {
    const legend = L.control({ position: "bottomright" });

    legend.onAdd = function () {
        const div = L.DomUtil.create("div", "legend");
        const grades = [0, 10, 20, 40, 60, 80, 100, 120];

        div.innerHTML = "<b>Tree Carbon (kg C)</b><br>";

        for (let i = 0; i < grades.length; i++) {
            div.innerHTML +=
                `<i style="background:${getColor(grades[i] + 1)}"></i>
                 ${grades[i]}${grades[i + 1] ? "–" + grades[i + 1] : "+"}<br>`;
        }

        return div;
    };

    legend.addTo(mapInstance);
}

// =====================================================
// ADD GEOJSON LAYERS
// =====================================================
const geoA = L.geoJSON(analysisA.geojson, {
    pointToLayer: pointStyle
}).addTo(mapA);

const geoB = L.geoJSON(analysisB.geojson, {
    pointToLayer: pointStyle
}).addTo(mapB);

// setTimeout(() => {
    mapA.invalidateSize();
    mapB.invalidateSize();

    const boundsA = geoA.getBounds();
    const boundsB = geoB.getBounds();

    mapA.fitBounds(boundsA, { maxZoom: 17 });
    mapB.fitBounds(boundsB, { maxZoom: 17 });

    addAOIMask(mapA, boundsA);
    addAOIMask(mapB, boundsB);
// }, 300);


// =====================================================
// ADD LEGENDS TO BOTH MAPS
// =====================================================
addLegend(mapA);
addLegend(mapB);
let isSyncing = false;

function syncMaps(source, target) {
    if (isSyncing) return;
    isSyncing = true;

    target.setView(
        source.getCenter(),
        source.getZoom(),
        { animate: false }
    );

    isSyncing = false;
}

mapA.on("moveend", () => syncMaps(mapA, mapB));
mapB.on("moveend", () => syncMaps(mapB, mapA));

// =====================================================
// KPI HELPERS
// =====================================================
function pctChange(a, b) {
    if (!a || a === 0) return "–";
    const p = ((b - a) / a) * 100;
    return `${p > 0 ? "+" : ""}${p.toFixed(1)} %`;
}

function deltaClass(a, b) {
    return b > a ? "delta-up" : b < a ? "delta-down" : "";
}

// =====================================================
// KPI VALUES
// =====================================================
const meanA = analysisA.stats.mean_acd;
const meanB = analysisB.stats.mean_acd;

const totalA = analysisA.stats.total_carbon_tonnes;
const totalB = analysisB.stats.total_carbon_tonnes;

const densA = analysisA.stats.carbon_density; // kg/ha
const densB = analysisB.stats.carbon_density;

const confA = analysisA.stats.confidence_score;
const confB = analysisB.stats.confidence_score;

// Mean
document.getElementById("meanA").textContent = meanA.toFixed(1);
document.getElementById("meanB").textContent = meanB.toFixed(1);
document.getElementById("meanDelta").textContent = pctChange(meanA, meanB);
document.getElementById("meanDelta").className = deltaClass(meanA, meanB);

// Total
document.getElementById("totalA").textContent = totalA.toFixed(1);
document.getElementById("totalB").textContent = totalB.toFixed(1);
document.getElementById("totalDelta").textContent = pctChange(totalA, totalB);
document.getElementById("totalDelta").className = deltaClass(totalA, totalB);

// Density (kg/ha)
document.getElementById("densityA").textContent = densA.toFixed(2);
document.getElementById("densityB").textContent = densB.toFixed(2);
document.getElementById("densityDelta").textContent =
    (densB - densA).toFixed(2);
document.getElementById("densityDelta").className = deltaClass(densA, densB);

// Confidence
document.getElementById("confA").textContent = confA.toFixed(2);
document.getElementById("confB").textContent = confB.toFixed(2);
document.getElementById("confDelta").textContent =
    (confB - confA).toFixed(2);
document.getElementById("confDelta").className = deltaClass(confA, confB);

console.log("✅ Comparison dashboard loaded successfully");

