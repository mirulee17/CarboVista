// ==================================================
// AOI COMPARISON CONTROLLER (SINGLE AOI, TWO TIMES)
// ==================================================

function AOICompareController(config) {
    const {
        mapId,
        drawBtnId,
        startDateAId,
        endDateAId,
        startDateBId,
        endDateBId,
        aoiTextId,
        storageKey
    } = config;

    let selectedAOI = null;
    let isAOIValid = false;
    let isDateAValid = false;
    let isDateBValid = false;

    // ================= MAP =================
    const map = L.map(mapId).setView([3.1390, 101.6869], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    setTimeout(() => map.invalidateSize(), 100);

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
    document.getElementById(drawBtnId)?.addEventListener("click", () => {
        drawControl._toolbars.draw._modes.rectangle.handler.enable();
    });

    // ================= AOI CREATED =================
    map.on(L.Draw.Event.CREATED, e => {
        isAOIValid = false;

        const layer = e.layer;
        const bounds = layer.getBounds();
        const area = calculateAreaKm2(bounds);

        if (area > MAX_AREA_KM2) {
            alert("AOI too large (maximum allowed is 0.7 km²).");
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

        localStorage.setItem(storageKey, JSON.stringify(selectedAOI));

        document.getElementById(aoiTextId).innerHTML = `
            <b>Area:</b> ${area.toFixed(2)} km²<br>
            <b>North:</b> ${selectedAOI.north.toFixed(5)}<br>
            <b>South:</b> ${selectedAOI.south.toFixed(5)}<br>
            <b>East:</b> ${selectedAOI.east.toFixed(5)}<br>
            <b>West:</b> ${selectedAOI.west.toFixed(5)}
        `;

        isAOIValid = true;
    });

    // ================= DATE VALIDATION =================
    function validateRange(startInput, endInput) {
        if (!startInput.value || !endInput.value) return false;

        const s = new Date(startInput.value);
        const e = new Date(endInput.value);
        const days = daysBetween(s, e);

        return (
            s >= MIN_START_DATE &&
            e > s &&
            days >= MIN_RANGE_DAYS &&
            days <= MAX_RANGE_DAYS
        );
    }

    const startA = document.getElementById(startDateAId);
    const endA = document.getElementById(endDateAId);
    const startB = document.getElementById(startDateBId);
    const endB = document.getElementById(endDateBId);

    function validateDates() {
        isDateAValid = validateRange(startA, endA);
        isDateBValid = validateRange(startB, endB);
    }

    startA?.addEventListener("change", validateDates);
    endA?.addEventListener("change", validateDates);
    startB?.addEventListener("change", validateDates);
    endB?.addEventListener("change", validateDates);

    return {
        getState: () => ({
            selectedAOI,
            isAOIValid,
            isDateAValid,
            isDateBValid
        })
    };
}

// ==================================================
// INIT (SINGLE AOI, TWO TIMES)
// ==================================================

const compareController = AOICompareController({
    mapId: "map",
    drawBtnId: "drawBoxBtn",
    startDateAId: "startDateA",
    endDateAId: "endDateA",
    startDateBId: "startDateB",
    endDateBId: "endDateB",
    aoiTextId: "aoiText",
    storageKey: "aoi_compare"
});

// ==================================================
// RUN COMPARISON
// ==================================================

const runBtn = document.getElementById("runCompareBtn");

runBtn?.addEventListener("click", () => {
    const state = compareController.getState();

    if (!state.isAOIValid) {
        alert("Please draw a valid AOI.");
        return;
    }

    if (!state.isDateAValid || !state.isDateBValid) {
        alert("Both time ranges must be valid.");
        return;
    }

    console.log("AOI:", state.selectedAOI);
    console.log("Time A:", startDateA.value, endDateA.value);
    console.log("Time B:", startDateB.value, endDateB.value);

    // 🔜 NEXT STEP:
    // Send AOI + Time A + Time B to backend
});
