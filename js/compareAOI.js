// ================= GLOBAL STATE =================
let selectedAOI = null;
let isAOIValid = false;
let isDateValid = false;
let malaysiaLoaded = false;

const MAX_AREA_KM2 = 0.7;
const MIN_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 365;
const MIN_START_DATE = new Date("2017-01-01");

const startDateA = document.getElementById("startDateA");
const endDateA   = document.getElementById("endDateA");
const startDateB = document.getElementById("startDateB");
const endDateB   = document.getElementById("endDateB");


const todayStr = new Date().toISOString().split("T")[0];

[startDateA, endDateA, startDateB, endDateB].forEach(input => {
    input.max = todayStr;
    input.min = "2017-01-01";
});


startDateA.addEventListener("change", () => {
    endDateA.min = startDateA.value;
});

startDateB.addEventListener("change", () => {
    endDateB.min = startDateB.value;
});


// ================= LEAFLET AREA FORMATTER =================
L.GeometryUtil.readableArea = function (area) {
    const km2 = area / 1e6;
    const color = km2 > 0.7 ? "#ff4d4d" : "#6ee7b7";
    return `<span style="color:${color};font-weight:600">
        Area: ${km2.toFixed(2)} km²
    </span>`;
};

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
        alert(
            `AOI too large (${area.toFixed(2)} km²).\n\n` +
            `Maximum supported area is 0.7 km².\n` +
            `This ensures stable carbon estimation.`
        );
        return;
    }


    drawnItems.clearLayers();
    drawnItems.addLayer(layer);
    drawControl._toolbars.draw._modes.rectangle.handler.disable();

    selectedAOI = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        area_km2: area
    };

    // 🔑 Store AOI polygon for backend
    const aoiPolygon = [[
        [selectedAOI.west, selectedAOI.north],
        [selectedAOI.east, selectedAOI.north],
        [selectedAOI.east, selectedAOI.south],
        [selectedAOI.west, selectedAOI.south],
        [selectedAOI.west, selectedAOI.north]
    ]];

    // 🔑 Always overwrite AOI
    localStorage.setItem("aoi", JSON.stringify(aoiPolygon));

    // 🔑 Clear any previous analysis tied to old AOI
    localStorage.removeItem("aoiBounds");
    localStorage.removeItem("analysisA");
    localStorage.removeItem("analysisB");

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

    // SAFE enable
    map.fire("draw:drawstart");
    drawControl._toolbars.draw._modes.rectangle.handler.enable();
});


// ================= RUN BUTTON =================
const runBtn = document.getElementById("runCompareBtn");

function updateRunButton() {
    const enabled = isAOIValid && isDateValid;
    runBtn.disabled = !enabled;
    runBtn.classList.toggle("enabled", enabled);
}
updateRunButton();

// ================= LOADING BUFFER =================
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");

function showLoading() {
    loadingOverlay.classList.remove("hidden");

    const steps = [
        "Loading Sentinel-2 imagery…",
        "Applying cloud masking & compositing…",
        "Estimating tree carbon density…",
        "Generating spatial dashboard…"
    ];

    let i = 0;
    loadingText.textContent = steps[i];

    return setInterval(() => {
        if (i < steps.length - 1) {
            i++;
            loadingText.textContent = steps[i];
        }
    }, 1200);
}

function hideLoading(intervalId) {
    clearInterval(intervalId);
    loadingOverlay.classList.add("hidden");
}
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

function validateDateRange(startInput, endInput, label) {
    if (!startInput.value || !endInput.value) return false;

    const s = new Date(startInput.value);
    const e = new Date(endInput.value);

    if (s < MIN_START_DATE) {
        alert(`${label}: Start date must be on or after 1 Jan 2017`);
        return false;
    }

    if (e > new Date()) {
        alert(`${label}: End date cannot exceed today`);
        return false;
    }

    if (e <= s) {
        alert(`${label}: End date must be after start date`);
        return false;
    }

    const days = daysBetween(s, e);
    if (days < MIN_RANGE_DAYS || days > MAX_RANGE_DAYS) {
        alert(`${label}: Date range must be between 30 and 365 days`);
        return false;
    }

    return true;
}


[startDateA, endDateA, startDateB, endDateB].forEach(input => {
    input.addEventListener("change", () => {
        const validA = validateDateRange(startDateA, endDateA, "Time Period A");
        const validB = validateDateRange(startDateB, endDateB, "Time Period B");


        isDateValid = validA && validB;
        updateRunButton();
    });
});

// ================= RUN =================
runBtn.addEventListener("click", async () => {
    if (!(isAOIValid && isDateValid)) return;

    runBtn.disabled = true;
    runBtn.textContent = "Running analysis...";

    // 🔹 SHOW LOADING OVERLAY
    const loadingSteps = [
        "Loading Sentinel-2 imagery…",
        "Applying cloud masking & compositing…",
        "Estimating tree carbon density…",
        "Generating spatial dashboard…"
    ];

    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = document.getElementById("loadingText");

    loadingOverlay.classList.remove("hidden");
    loadingText.textContent = loadingSteps[0];

    let stepIndex = 0;
    const loadingInterval = setInterval(() => {
        if (stepIndex < loadingSteps.length - 1) {
            stepIndex++;
            loadingText.textContent = loadingSteps[stepIndex];
        }
    }, 1200);

    try {
    const aoi = JSON.parse(localStorage.getItem("aoi"));

    const payloadA = {
        aoi,
        start_date: startDateA.value,
        end_date: endDateA.value
    };

    const payloadB = {
        aoi,
        start_date: startDateB.value,
        end_date: endDateB.value
    };

    const resA = await fetch("http://127.0.0.1:5000/run-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadA)
    });

    if (!resA.ok) throw new Error("Period A failed");
    const dataA = await resA.json();

    const resB = await fetch("http://127.0.0.1:5000/run-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadB)
    });

    if (!resB.ok) throw new Error("Period B failed");
    const dataB = await resB.json();


        // ✅ STORE RESULTS
        localStorage.setItem("analysisA", JSON.stringify(dataA));
        localStorage.setItem("analysisB", JSON.stringify(dataB));

        localStorage.setItem("comparisonMeta", JSON.stringify({
            periodA: payloadA,
            periodB: payloadB
        }));


        // ✅ STORE AOI BOUNDS FOR DASHBOARD
        localStorage.setItem(
            "aoiBounds",
            JSON.stringify([
                [selectedAOI.south, selectedAOI.west],
                [selectedAOI.north, selectedAOI.east]
            ])
        );

        // 🔹 CLEAN UP LOADING UI
        clearInterval(loadingInterval);
        loadingOverlay.classList.add("hidden");

        // ✅ REDIRECT ONLY AFTER DATA EXISTS
        window.location.href = "dashboard-compare.html";

    } catch (err) {
        console.error(err);

        // 🔹 CLEAN UP LOADING UI ON ERROR
        clearInterval(loadingInterval);
        loadingOverlay.classList.add("hidden");

        alert("Failed to run analysis. Please try again.");
        runBtn.disabled = false;
        runBtn.textContent = "Run Analysis";
    }
});