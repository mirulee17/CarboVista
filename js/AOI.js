// ================= OVERRIDE AREA FORMATTER (KM²) =================
L.GeometryUtil.readableArea = function (area) {
    const areaKm2 = area / 1e6; // m² → km²
    const color = areaKm2 > 2 ? "#ff4d4d" : "#2f7d32";

    return `<span style="color:${color}; font-weight:600">
        Area: ${areaKm2.toFixed(2)} km²
    </span>`;
};

// ================= GLOBAL AOI STORAGE =================
let selectedAOI = null;
let isAOIValid = false;
const MAX_AREA_KM2 = 2;

// ================= INITIALIZE MAP =================
const map = L.map("map").setView([3.1390, 101.6869], 10);

// ================= BASEMAP =================
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// ================= DRAWN ITEMS GROUP =================
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// ================= MALAYSIA POLYGON =================
let malaysiaLayer = null;
let malaysiaLoaded = false;

fetch("data/malaysia_boundary.geojson")
    .then(res => res.json())
    .then(data => {
        malaysiaLayer = L.geoJSON(data);
        malaysiaLoaded = true;
        console.log("Malaysia boundary loaded");
    })
    .catch(err => console.error("Failed to load Malaysia boundary:", err));

// ================= DRAW CONTROL =================
const drawControl = new L.Control.Draw({
    draw: {
        polygon: false,
        polyline: false,
        circle: false,
        marker: false,
        circlemarker: false,
        rectangle: {
            shapeOptions: { color: "#2f7d32" },
            showArea: true,   // ✅ USE BUILT-IN AREA TOOLTIP
            metric: true      // required (we override output anyway)
        }
    },
    edit: {
        featureGroup: drawnItems
    }
});
map.addControl(drawControl);

// ================= AREA CALCULATION (km²) =================
function calculateAreaKm2(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return Math.abs((ne.lat - sw.lat) * (ne.lng - sw.lng)) * 111 * 111;
}

// ================= MALAYSIA CONTAINMENT CHECK =================
function isPointInMalaysia(latlng) {
    return leafletPip.pointInLayer(latlng, malaysiaLayer).length > 0;
}

function isAOIInsideMalaysia(bounds) {
    const corners = [
        bounds.getNorthWest(),
        bounds.getNorthEast(),
        bounds.getSouthWest(),
        bounds.getSouthEast()
    ];
    return corners.every(pt => isPointInMalaysia(pt));
}

// ================= RUN BUTTON HELPERS =================
function enableRunButton() {
    const btn = document.getElementById("runBtn");
    btn.disabled = false;
    btn.classList.add("enabled");
}

function disableRunButton() {
    const btn = document.getElementById("runBtn");
    btn.disabled = true;
    btn.classList.remove("enabled");
}
disableRunButton();

// ================= DRAW BUTTON =================
document.getElementById("drawBoxBtn").addEventListener("click", () => {
    if (!malaysiaLoaded) {
        alert("Malaysia boundary still loading.");
        return;
    }
    drawControl._toolbars.draw._modes.rectangle.handler.enable();
});

// ================= AOI CREATED =================
map.on(L.Draw.Event.CREATED, event => {
    disableRunButton();
    isAOIValid = false;
    selectedAOI = null;

    if (!malaysiaLoaded) {
        alert("Malaysia boundary still loading.");
        return;
    }

    const layer = event.layer;
    const bounds = layer.getBounds();

    // ---------- Malaysia check ----------
    if (!isAOIInsideMalaysia(bounds)) {
        alert("AOI must be fully within Malaysia.");
        return;
    }

    // ---------- Area check ----------
    const areaKm2 = calculateAreaKm2(bounds);
    if (areaKm2 > MAX_AREA_KM2) {
        alert(`AOI too large (${areaKm2.toFixed(2)} km²). Max is ${MAX_AREA_KM2} km².`);
        return;
    }

    drawnItems.clearLayers();
    drawnItems.addLayer(layer);

    selectedAOI = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        area_km2: areaKm2
    };

    isAOIValid = true;
    enableRunButton();

    document.getElementById("aoiText").innerHTML = `
        <b>Area:</b> ${areaKm2.toFixed(2)} km²<br>
        <b>North:</b> ${selectedAOI.north.toFixed(5)}<br>
        <b>South:</b> ${selectedAOI.south.toFixed(5)}<br>
        <b>East:</b> ${selectedAOI.east.toFixed(5)}<br>
        <b>West:</b> ${selectedAOI.west.toFixed(5)}
    `;
});

// ================= RUN ANALYSIS =================
document.getElementById("runBtn").addEventListener("click", () => {
    if (!isAOIValid) return;
    window.location.href = "dashboard.html";
});
