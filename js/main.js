// ================= GLOBAL AOI STORAGE =================
let selectedAOI = null;

// ================= INITIALIZE MAP =================
const map = L.map('map').setView([3.1390, 101.6869], 10);

// ================= BASEMAP =================
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ================= DRAWN ITEMS GROUP =================
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// ================= DRAW CONTROL (RECTANGLE ONLY) =================
const drawControl = new L.Control.Draw({
    draw: {
        polygon: false,
        polyline: false,
        circle: false,
        marker: false,
        circlemarker: false,
        rectangle: {
            shapeOptions: {
                color: '#2f7d32'
            }
        }
    },
    edit: {
        featureGroup: drawnItems
    }
});

// Add draw tools to map
map.addControl(drawControl);

// ================= DRAW BOUNDING BOX EVENT =================
map.on(L.Draw.Event.CREATED, function (event) {
    const layer = event.layer;

    // Clear previous AOI
    drawnItems.clearLayers();
    drawnItems.addLayer(layer);

    // Get bounds
    const bounds = layer.getBounds();

    // Store AOI globally
    selectedAOI = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
    };

    // Update sidebar AOI info
    document.getElementById("aoiText").innerHTML = `
        <b>North:</b> ${selectedAOI.north.toFixed(5)}<br>
        <b>South:</b> ${selectedAOI.south.toFixed(5)}<br>
        <b>East:</b> ${selectedAOI.east.toFixed(5)}<br>
        <b>West:</b> ${selectedAOI.west.toFixed(5)}
    `;

    console.log("Selected AOI:", selectedAOI);
});

// ================= DRAW BUTTON (UX IMPROVEMENT) =================
document.getElementById("drawBoxBtn").addEventListener("click", function () {
    new L.Draw.Rectangle(map, drawControl.options.draw.rectangle).enable();
});

// ================= RUN ANALYSIS BUTTON =================
document.getElementById("runBtn").addEventListener("click", function () {

    if (!selectedAOI) {
        alert("Please draw a bounding box before running analysis.");
        return;
    }

    // Display AOI summary (frontend simulation)
    alert(
        `Analysis Started 🌱

AOI Details:
North: ${selectedAOI.north.toFixed(5)}
South: ${selectedAOI.south.toFixed(5)}
East: ${selectedAOI.east.toFixed(5)}
West: ${selectedAOI.west.toFixed(5)}

Proceeding to analysis dashboard...`
    );

    // Redirect to dashboard page
    window.location.href = "dashboard.html";
});
