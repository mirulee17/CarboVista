// ================= LEAFLET AREA FORMATTER =================
L.GeometryUtil.readableArea = function (area) {
    const km2 = area / 1e6;
    const color = km2 > 2 ? "#ff4d4d" : "#2f7d32";
    return `<span style="color:${color};font-weight:600">
        Area: ${km2.toFixed(2)} km²
    </span>`;
};

// ================= GLOBAL STATE =================
let selectedAOI = null;
let isAOIValid = false;
let isDateValid = false;
let malaysiaLoaded = false;

const MAX_AREA_KM2 = 2;
const MIN_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 365;
const MIN_START_DATE = new Date("2017-01-01");

// ================= MAP INIT =================
const map = L.map("map").setView([3.1390, 101.6869], 10);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// ================= MALAYSIA BOUNDARY =================
let malaysiaLayer = null;

fetch("data/malaysia_boundary.geojson")
    .then(r => r.json())
    .then(g => {
        malaysiaLayer = L.geoJSON(g);
        malaysiaLoaded = true;
    })
    .catch(() => alert("Failed to load Malaysia boundary"));

// ================= HELPERS =================
function calculateAreaKm2(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return Math.abs((ne.lat - sw.lat) * (ne.lng - sw.lng)) * 111 * 111;
}

function isAOIInsideMalaysia(bounds) {
    if (!malaysiaLoaded || !malaysiaLayer) return false;

    return [
        bounds.getNorthWest(),
        bounds.getNorthEast(),
        bounds.getSouthWest(),
        bounds.getSouthEast()
    ].every(pt =>
        leafletPip.pointInLayer(pt, malaysiaLayer).length > 0
    );
}

function daysBetween(a, b) {
    return (b - a) / (1000 * 60 * 60 * 24);
}

// ================= RUN BUTTON =================
const runBtn = document.getElementById("runBtn");

function updateRunButton() {
    const enabled = isAOIValid && isDateValid;
    runBtn.disabled = !enabled;
    runBtn.classList.toggle("enabled", enabled);
}
updateRunButton();

// ================= DATE VALIDATION =================
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");

const todayStr = new Date().toISOString().split("T")[0];
[startDate, endDate].forEach(i => {
    if (!i) return;
    i.min = "2017-01-01";
    i.max = todayStr;
});

function validateDates(showAlert = false) {
    if (!startDate.value || !endDate.value) {
        isDateValid = false;
        updateRunButton();
        return;
    }

    const s = new Date(startDate.value);
    const e = new Date(endDate.value);

    if (s < MIN_START_DATE) {
        if (showAlert) alert("Start date must be on or after 1 Jan 2017");
        isDateValid = false; updateRunButton(); return;
    }

    if (e <= s) {
        if (showAlert) alert("End date must be after start date");
        isDateValid = false; updateRunButton(); return;
    }

    const days = daysBetween(s, e);
    if (days < MIN_RANGE_DAYS || days > MAX_RANGE_DAYS) {
        if (showAlert) alert("Date range must be 30–365 days");
        isDateValid = false; updateRunButton(); return;
    }

    isDateValid = true;
    updateRunButton();
}

startDate?.addEventListener("change", () => validateDates(true));
endDate?.addEventListener("change", () => validateDates(true));

// ================= LOCATION SEARCH (SIDEBAR – STABLE) =================
const locationInput = document.getElementById("locationSearch");

locationInput?.addEventListener("keydown", async e => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const query = locationInput.value.trim();
    if (!query) return;

    const url = `https://nominatim.openstreetmap.org/search?` +
        new URLSearchParams({
            q: query,
            format: "json",
            countrycodes: "my",
            limit: 1
        });

    try {
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });

        const data = await res.json();

        if (!data || data.length === 0) {
            alert("Location not found in Malaysia.");
            return;
        }

        zoomToResult({
            center: L.latLng(data[0].lat, data[0].lon),
            bbox: [
                data[0].lat,
                data[0].lon,
                data[0].lat,
                data[0].lon
            ]
        });

    } catch (err) {
        alert("Failed to search location.");
        console.error(err);
    }
});

function zoomToResult(r) {
    const center = r.center;

    map.setView(center, 15);

    const marker = L.circleMarker(center, {
        radius: 6,
        color: "#2f7d32",
        fillColor: "#2f7d32",
        fillOpacity: 0.85
    }).addTo(map);

    setTimeout(() => map.removeLayer(marker), 2500);
}


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
            showArea: true,
            metric: true
        }
    },
    edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

// ================= DRAW BUTTON =================
document.getElementById("drawBoxBtn").addEventListener("click", () => {
    if (!malaysiaLoaded) {
        alert("Malaysia boundary still loading");
        return;
    }
    drawControl._toolbars.draw._modes.rectangle.handler.enable();
});

// ================= AOI CREATED =================
map.on(L.Draw.Event.CREATED, e => {
    isAOIValid = false;
    selectedAOI = null;
    updateRunButton();

    const layer = e.layer;
    const bounds = layer.getBounds();

    if (!isAOIInsideMalaysia(bounds)) {
        alert("AOI must be fully within Malaysia");
        return;
    }

    const area = calculateAreaKm2(bounds);
    if (area > MAX_AREA_KM2) {
        alert(`AOI too large (${area.toFixed(2)} km²). Max is 2 km².`);
        return;
    }

    drawnItems.clearLayers();
    drawnItems.addLayer(layer);

    selectedAOI = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        area_km2: area
    };

    isAOIValid = true;
    updateRunButton();

    document.getElementById("aoiText").innerHTML = `
        <b>Area:</b> ${area.toFixed(2)} km²<br>
        <b>North:</b> ${selectedAOI.north.toFixed(5)}<br>
        <b>South:</b> ${selectedAOI.south.toFixed(5)}<br>
        <b>East:</b> ${selectedAOI.east.toFixed(5)}<br>
        <b>West:</b> ${selectedAOI.west.toFixed(5)}
    `;
});

// ================= RUN =================
runBtn.addEventListener("click", () => {
    if (!(isAOIValid && isDateValid)) return;
    window.location.href = "dashboard.html";
});