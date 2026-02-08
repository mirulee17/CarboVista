// =====================================================
// LOAD STORED ANALYSIS RESULT
// =====================================================
const analysis = JSON.parse(localStorage.getItem("analysisResult"));
const aoiBounds = JSON.parse(localStorage.getItem("aoiBounds"));

if (!analysis || !analysis.geojson || !analysis.stats) {
    alert("No analysis data found. Please run analysis again.");
    window.location.href = "AOI.html";
    throw new Error("Missing analysisResult");
}

const stats = analysis.stats;
const features = analysis.geojson.features;
const CARBON_COLORS = {
    veryLow: "#fdf5c9",   // 0–10
    low:     "#f6e8a7",   // 10–20
    lowMed:  "#a6d96a",   // 20–40
    medium:  "#1a9850",   // 40–60
    medHigh: "#fc8d59",   // 60–80
    high:    "#d73027",   // 80–100
    veryHigh:"#b30000",   // 100–120
    extreme: "#7f0000"    // 120+
};

// =====================================================
// MAP INITIALISATION
// =====================================================
const map = L.map("map");

// =====================================================
// BASE MAP LAYERS
// =====================================================

// Street map (default)
const streetMap = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "&copy; OpenStreetMap contributors"
    }
);

// Satellite imagery (Google-like)
const satelliteMap = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/" +
    "World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        attribution:
            "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
    }
);

// Add default base layer
streetMap.addTo(map);


// =====================================================
// LAYER CONTROL (Map Switcher)
// =====================================================
L.control.layers(
    {
        "Street Map": streetMap,
        "Satellite Map": satelliteMap
    },
    null,
    { position: "topright", collapsed: false }
).addTo(map);



// ================= GIS COLOR SCALE (Yellow → Green → Red) =================
// Low carbon  → Yellow
// Medium      → Green
// High carbon → Red
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


function addAOIMask(bounds) {
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
            fillOpacity: 0.55,
            stroke: false,
            interactive: false
        }
    ).addTo(map);
}


// =====================================================
// KPI VALUES
// =====================================================
document.getElementById("mean").textContent =
    stats.mean_acd.toFixed(2);

document.getElementById("min").textContent =
    stats.min_acd.toFixed(2);

document.getElementById("max").textContent =
    stats.max_acd.toFixed(2);

document.getElementById("total").textContent =
    stats.total_carbon_tonnes.toFixed(2);

document.getElementById("count").textContent =
    stats.n_pixels;

// document.getElementById("vegetatedAreaHa").textContent =
//     stats.vegetated_area_ha.toFixed(1);

// document.getElementById("vegetatedAreaKm2").textContent =
//     stats.vegetated_area_km2.toFixed(1);

document.getElementById("carbonVariability").textContent =
    stats.carbon_variability.toFixed(2);


document.getElementById("confidenceScore").textContent =
    stats.confidence_score.toFixed(2);

document.getElementById("carbonDensity").textContent =
    stats.carbon_density.toFixed(2);
// Header metadata
document.getElementById("aoiAddress").textContent =
    stats.aoi_address || "Unknown location";

document.getElementById("aoiArea").textContent =
    stats.aoi_area_km2.toFixed(3);

document.getElementById("startDate").textContent =
    stats.start_date;

document.getElementById("endDate").textContent =
    stats.end_date;

document.getElementById("carbonValue").textContent =
    stats.carbon_value_rm.toLocaleString("en-MY");

// =====================================================
// GEOJSON LAYER
// =====================================================
const geoLayer = L.geoJSON(analysis.geojson, {
    pointToLayer: pointStyle
}).addTo(map);


// ================= GIS LEGEND =================
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

legend.addTo(map);

// Fit map to AOI
// Force correct sizing AFTER layout settles
setTimeout(() => {
    map.invalidateSize();

    const bounds = geoLayer.getBounds();

    if (bounds.isValid()) {
        map.fitBounds(bounds, {
            padding: [0, 0],
            maxZoom: 17,
            animate: false,
        });
        addAOIMask(bounds);
    }
}, 300);



// Scale bar (metric – Malaysia)
L.control.scale({
    metric: true,
    imperial: false,
    position: "bottomleft"
}).addTo(map);


// =====================================================
// HISTOGRAM (kg C)
// =====================================================
const acdValues = features.map(f => f.properties.carbon_kg);

const histBins = [
  { label: "< 25", min: -Infinity, max: 25 },
  { label: "25–50", min: 25, max: 50 },
  { label: "50–75", min: 50, max: 75 },
  { label: "75–100", min: 75, max: 100 },
  { label: "> 100", min: 100, max: Infinity }
];


const histCounts = histBins.map(bin =>
    acdValues.filter(v => v > bin.min && v <= bin.max).length
);

new Chart(
    document.getElementById("acdHistogram"),
    {
        type: "bar",
        data: {
            labels: histBins.map(b => b.label),
            datasets: [{
                data: histCounts,
                backgroundColor: [
                    CARBON_COLORS.veryLow,   // < 25
                    CARBON_COLORS.lowMed,    // 25–50
                    CARBON_COLORS.medHigh,   // 50–75
                    CARBON_COLORS.high,      // 75–100
                    CARBON_COLORS.veryHigh   // > 100
                ],
                borderColor: "rgba(255,255,255,0.15)",
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // 🔧 REQUIRED
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: "Pixel Count" }
                },
                x: {
                    title: { display: true, text: "Tree Carbon (kg C)" }
                }
            }
        }
    }
);


// =====================================================
// PIE CHART (Low / Medium / High)
// =====================================================
const lowCount = acdValues.filter(v => v < 30).length;
const medCount = acdValues.filter(v => v >= 30 && v < 60).length;
const highCount = acdValues.filter(v => v >= 60).length;

new Chart(
    document.getElementById("acdPie"),
    {
        type: "pie",
        data: {
            labels: ["Low", "Medium", "High"],
            datasets: [{
                data: [lowCount, medCount, highCount],
                backgroundColor: [
                    CARBON_COLORS.low,   // Low
                    CARBON_COLORS.medium,  // Medium
                    CARBON_COLORS.high     // High
                ],
                borderColor: "rgba(15,31,28,0.35)",
                borderWidth: 0,
                borderJoinStyle: "round",
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "#9fbeb6",
                        boxWidth: 14,
                        boxHeight: 14,
                        padding: 14,
                        font: {
                            size: 12,
                            weight: "500"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const data = context.dataset.data;
                            const total = data.reduce((a, b) => a + b, 0);
                            const value = context.raw;
                            const percent = ((value / total) * 100).toFixed(1);

                            return `${context.label}: ${percent}% (${value} pixels)`;
                        }
                    }
                }
            }
        }
    }
);

// =====================================================
// DOWNLOAD CSV
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    const downloadBtn = document.getElementById("downloadCsvBtn");

    if (!downloadBtn) return;

    downloadBtn.addEventListener("click", async () => {

        const aoi = localStorage.getItem("aoi");
        const startDate = localStorage.getItem("startDate");
        const endDate = localStorage.getItem("endDate");

        if (!aoi || !startDate || !endDate) {
            alert("Analysis data missing. Please re-run analysis.");
            return;
        }

        try {
            const res = await fetch("http://127.0.0.1:5000/download-csv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    aoi: JSON.parse(aoi),
                    start_date: startDate,
                    end_date: endDate
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "CSV download failed");
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = "carbovista_pixel_predictions.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();

            window.URL.revokeObjectURL(url);

        } catch (err) {
            alert(err.message);
        }
    });
});



// =====================================================
// IMAGE CAPTURE HELPERS (PDF EXPORT)
// =====================================================
function captureMapImage() {
    return new Promise((resolve, reject) => {
        leafletImage(map, function (err, canvas) {
            if (err) {
                reject(err);
                return;
            }
            resolve(canvas.toDataURL("image/png"));
        });
    });
}

function captureChartImage(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return canvas.toDataURL("image/png");
}



// =====================================================
// DOWNLOAD PDF
// =====================================================
const downloadPdfBtn = document.getElementById("downloadPdf");

downloadPdfBtn.addEventListener("click", async () => {
    try {
        await new Promise(r => setTimeout(r, 500));
        const mapImage = await captureMapImage();
        const histImage = captureChartImage("acdHistogram");
        const pieImage = captureChartImage("acdPie");

        const res = await fetch("http://127.0.0.1:5000/download-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                stats: {
                    ...stats,
                    start_date: stats.start_date,
                    end_date: stats.end_date
                },
                images: {
                    map: mapImage,
                    histogram: histImage,
                    pie: pieImage
                }
            })
        });

        if (!res.ok) {
            alert("Failed to generate PDF");
            return;
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "carbovista_report.pdf";
        a.click();
    } catch (err) {
        console.error(err);
        alert("PDF generation error");
    }
});

// =====================================================
// KPI TOGGLE
// =====================================================
function toggleKpiInfo(card) {
    card.classList.toggle("active");
}
