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

// =====================================================
// MAP INITIALISATION
// =====================================================
const map = L.map("map");
const canvasRenderer = L.canvas({ padding: 0.5 });

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// ================= GIS COLOR SCALE (Yellow → Green → Red) =================
// Low carbon  → Yellow
// Medium      → Green
// High carbon → Red
function getColor(carbonKg) {
    return carbonKg > 120 ? "#7f0000" :  // dark red
           carbonKg > 100 ? "#b30000" :
           carbonKg > 80  ? "#d73027" :
           carbonKg > 60  ? "#fc8d59" :
           carbonKg > 40  ? "#91cf60" :  // green
           carbonKg > 25  ? "#d9ef8b" :
           carbonKg > 10  ? "#fee08b" :
                            "#ffffcc"; // pale yellow
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
    stats.total_carbon.toFixed(2);

document.getElementById("count").textContent =
    stats.n_pixels;

document.getElementById("vegCoverage").textContent =
    stats.vegetation_coverage.toFixed(1);

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

// =====================================================
// GEOJSON LAYER
// =====================================================
const geoLayer = L.geoJSON(analysis.geojson, {
    pointToLayer: (feature, latlng) => {
        const carbonKg = feature.properties.carbon_kg;

        return L.circleMarker(latlng, {
            radius: 4,
            fillColor: getColor(carbonKg),
            color: "rgba(0,0,0,0.15)",
            weight: 0.5,
            fillOpacity: 0.9
        });
    }
}).addTo(map);


// ================= GIS LEGEND =================
const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    const grades = [0, 10, 25, 40, 60, 80, 100, 120];

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
if (aoiBounds) {
    map.fitBounds(aoiBounds);
} else {
    map.fitBounds(geoLayer.getBounds());
}

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
                    "#fee8c8",
                    "#fdbb84",
                    "#fc8d59",
                    "#e34a33",
                    "#7f0000"
                ]
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
                    "#fbff00ff",
                    "#00ff55ff",
                    "#d73027"
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // 🔧 REQUIRED
            plugins: {
                legend: { position: "bottom" }
            }
        }
    }
);

// =====================================================
// DOWNLOAD CSV
// =====================================================
const downloadBtn = document.getElementById("downloadCsv");

if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
        const res = await fetch("http://127.0.0.1:5000/download-csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                aoi: JSON.parse(localStorage.getItem("aoi")),
                start_date: localStorage.getItem("startDate"),
                end_date: localStorage.getItem("endDate")
            })
        });

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "carbovista_pixel_predictions.csv";
        a.click();
    });
}


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