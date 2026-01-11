# ============================================================
# CARBOVISTA — FLASK BACKEND
# Supports:
#   1) Point-based ACD prediction (/predict)
#   2) AOI-based spatial analysis (/run-analysis)
# ============================================================

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os
import csv
import io
from datetime import datetime
from pdf_utils import build_pdf

from geopy.geocoders import Nominatim
from gee_utils import init_ee, extract_s2_pixels

# ------------------------------------------------------------
# COMPUTE AOI AREA
# ------------------------------------------------------------
def compute_aoi_area_km2(aoi_coords):
    coords = aoi_coords[0]

    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]

    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    meters_per_deg_lat = 111_320
    meters_per_deg_lon = 111_320 * np.cos(np.deg2rad(np.mean(lats)))

    width_m = (max_lon - min_lon) * meters_per_deg_lon
    height_m = (max_lat - min_lat) * meters_per_deg_lat

    area_m2 = width_m * height_m
    return area_m2 / 1e6  # km²

# ------------------------------------------------------------
# 1️⃣ Initialize Flask + Earth Engine
# ------------------------------------------------------------
app = Flask(__name__)
CORS(app)

init_ee()

# ------------------------------------------------------------
# 2️⃣ Load trained model
# ------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "model",
    "acd_model.joblib"
)

model_bundle = joblib.load(MODEL_PATH)

rf_model = model_bundle["model"]
FEATURES = model_bundle["features"]

print("✅ Model loaded successfully")
print("✅ Expected features:", FEATURES)

# ------------------------------------------------------------
# 3️⃣ Health check
# ------------------------------------------------------------
@app.route("/", methods=["GET"])
def health_check():
    return jsonify({
        "status": "CarboVista backend running",
        "model": "Random Forest ACD"
    })

# ------------------------------------------------------------
# 4️⃣ POINT-BASED prediction (DEBUGGING)
# ------------------------------------------------------------
@app.route("/predict", methods=["POST"])
def predict_acd():
    try:
        data = request.get_json()

        X_user = pd.DataFrame([data])[FEATURES]
        X_np = X_user.values

        tree_preds = np.array([
            tree.predict(X_np)[0]
            for tree in rf_model.estimators_
        ])

        mean_pred = float(tree_preds.mean())
        std_pred = float(tree_preds.std())

        ci_lower = max(0.0, mean_pred - 1.96 * std_pred)
        ci_upper = mean_pred + 1.96 * std_pred

        confidence = (
            float(np.exp(-std_pred / mean_pred))
            if mean_pred > 0 else 0.0
        )
        confidence = round(min(max(confidence, 0.0), 1.0), 2)

        return jsonify({
            "predicted_acd_kg": round(mean_pred, 2),
            "confidence_score": confidence,
            "expected_range_kg": [
                round(ci_lower, 2),
                round(ci_upper, 2)
            ]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400

# ------------------------------------------------------------
# 5️⃣ AOI-BASED SPATIAL ANALYSIS (FINAL)
# ------------------------------------------------------------
@app.route("/run-analysis", methods=["POST"])
def run_analysis():
    try:
        payload = request.get_json()

        aoi_coords = payload.get("aoi")
        start_date = payload.get("start_date")
        end_date = payload.get("end_date")

        if not aoi_coords or not start_date or not end_date:
            return jsonify({"error": "Missing AOI or date range"}), 400

        # --------------------------------------------------
        # AOI area enforcement (backend authority)
        # --------------------------------------------------
        area_km2 = compute_aoi_area_km2(aoi_coords)

        if area_km2 > 2.0:
            return jsonify({
                "error": f"AOI too large ({area_km2:.2f} km²). "
                        "Maximum supported area is 2.0 km²."
            }), 400

        # --------------------------------------------------
        # 1️⃣ Extract pixel-wise Sentinel-2 features (GEE)
        # --------------------------------------------------
        fc = extract_s2_pixels(
            aoi_coords=aoi_coords,
            start_date=start_date,
            end_date=end_date
        )

        fc_info = fc.getInfo()
        features = fc_info.get("features", [])

        if len(features) == 0:
            return jsonify({"error": "No valid vegetation pixels found"}), 400

        # --------------------------------------------------
        # 2️⃣ Convert to pandas DataFrame
        # --------------------------------------------------
        rows = []
        for f in features:
            props = f["properties"]
            lon, lat = f["geometry"]["coordinates"]

            row = {k: props.get(k) for k in FEATURES}
            row["lon"] = lon
            row["lat"] = lat
            rows.append(row)

        df = pd.DataFrame(rows).dropna()

        if df.empty:
            return jsonify({"error": "All pixels invalid after filtering"}), 400

        # --------------------------------------------------
        # 3️⃣ Run ML inference (pixel-wise)
        # --------------------------------------------------
        X = df[FEATURES].values
        df["carbon_kg"] = rf_model.predict(X)

        # --------------------------------------------------
        # 4️⃣ GeoJSON
        # --------------------------------------------------
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [r["lon"], r["lat"]]
                    },
                    "properties": {
                        "carbon_kg": round(float(r["carbon_kg"]), 2)
                    }
                }
                for _, r in df.iterrows()
            ]
        }

        # --------------------------------------------------
        # 5️⃣ Additional KPIs (FINAL & MEANINGFUL)
        # --------------------------------------------------

        # Pixel counts (for diagnostics / charts)
        n_total_pixels = len(features)
        n_valid_pixels = len(df)

        # --------------------------------------------------
        # Basic statistics (per-pixel)
        # --------------------------------------------------
        mean_carbon = df["carbon_kg"].mean()
        std_carbon = df["carbon_kg"].std()

        # Prediction confidence (relative consistency)
        if mean_carbon > 0:
            confidence_score = float(np.exp(-std_carbon / mean_carbon))
        else:
            confidence_score = 0.0
        confidence_score = max(0.0, min(confidence_score, 1.0))

        # --------------------------------------------------
        # AREA-SCALED CARBON ESTIMATION
        # --------------------------------------------------

        # AOI area
        area_ha = area_km2 * 100  # 1 km² = 100 ha

        # Vegetated area (ha)
        # NOTE: Vegetation masking is applied upstream, so analysed area ≈ vegetated area
        vegetated_area_ha = area_ha

        # Estimated number of vegetation pixels (10 m × 10 m)
        estimated_veg_pixels = (vegetated_area_ha * 10_000) / 100

        # Estimated total carbon for full AOI (kg C)
        total_carbon_kg = mean_carbon * estimated_veg_pixels

        # Total carbon in tonnes (dashboard-friendly)
        total_carbon_t = total_carbon_kg / 1000

        # Carbon density (kg C / ha)
        carbon_density = (
            total_carbon_kg / vegetated_area_ha
            if vegetated_area_ha > 0 else 0.0
        )

        # --------------------------------------------------
        # CARBON VALUE (REFERENCE ONLY)
        # --------------------------------------------------

        # Convert to CO₂ equivalent (tonnes)
        co2e_tonnes = total_carbon_kg * 3.67 / 1000

        # Reference valuation (RM 50 / tCO₂e)
        carbon_value_rm = co2e_tonnes * 50



        # AOI address (repeat logic safely)
        aoi_address = "Unknown location"

        try:
            coords = aoi_coords[0]
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]

            lat_c = sum(lats) / len(lats)
            lon_c = sum(lons) / len(lons)

            geolocator = Nominatim(user_agent="carbovista")
            location = geolocator.reverse((lat_c, lon_c), zoom=14)

            if location and location.address:
                aoi_address = location.address

        except Exception as e:
            print("⚠️ Reverse geocoding failed:", e)


        # --------------------------------------------------
        # Dashboard statistics
        # --------------------------------------------------
        stats = {
            "n_pixels": int(n_valid_pixels),

            # Per-pixel statistics
            "mean_acd": float(mean_carbon),
            "min_acd": float(df["carbon_kg"].min()),
            "max_acd": float(df["carbon_kg"].max()),
            "std_acd": float(std_carbon),

            # AREA-SCALED totals
            "total_carbon_tonnes": round(total_carbon_t, 2),
            "carbon_value_rm": round(carbon_value_rm, 2),

            # Derived KPIs
            "vegetated_area_ha": round(vegetated_area_ha, 2),
            "confidence_score": round(confidence_score, 2),
            "carbon_density": round(carbon_density, 2),

            # AOI metadata
            "aoi_area_km2": round(area_km2, 3),
            "aoi_address": aoi_address,
            "start_date": start_date,
            "end_date": end_date
        }


        return jsonify({
            "stats": stats,
            "geojson": geojson
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ------------------------------------------------------------
# DOWNLOAD CSV
# ------------------------------------------------------------
@app.route("/download-csv", methods=["POST"])
def download_csv():
    try:
        payload = request.get_json()
        aoi_coords = payload.get("aoi")
        start_date = payload.get("start_date")
        end_date = payload.get("end_date")

        # Re-run analysis (or reuse cached result if you later add caching)
        fc = extract_s2_pixels(
            aoi_coords=aoi_coords,
            start_date=start_date,
            end_date=end_date
        )

        fc_info = fc.getInfo()
        features = fc_info.get("features", [])

        rows = []
        for f in features:
            props = f["properties"]
            lon, lat = f["geometry"]["coordinates"]

            row = {k: props.get(k) for k in FEATURES}
            row["lon"] = lon
            row["lat"] = lat
            rows.append(row)

        df = pd.DataFrame(rows).dropna()
        df["carbon_kg"] = rf_model.predict(df[FEATURES].values)

        # Carbon class
        def classify(v):
            if v >= 60: return "High"
            if v >= 30: return "Medium"
            return "Low"

        df["carbon_class"] = df["carbon_kg"].apply(classify)

        # ---- KPIs ----
        n_total_pixels = len(features)
        n_valid_pixels = len(df)
        vegetation_coverage = (n_valid_pixels / n_total_pixels) * 100
        confidence = float(
            np.exp(-df["carbon_kg"].std() / df["carbon_kg"].mean())
        )

        # ---- AOI area ----
        area_km2 = compute_aoi_area_km2(aoi_coords)

        # ---- AOI address ----
        aoi_address = "Unknown location"

        try:
            coords = aoi_coords[0]
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]

            lat_c = sum(lats) / len(lats)
            lon_c = sum(lons) / len(lons)

            geolocator = Nominatim(user_agent="carbovista")
            location = geolocator.reverse((lat_c, lon_c), zoom=14)

            if location and location.address:
                aoi_address = location.address

        except Exception as e:
            print("⚠️ Reverse geocoding failed:", e)

        # ---- CSV creation ----
        output = io.StringIO()
        writer = csv.writer(output)

        # Metadata header
        writer.writerow(["# CarboVista — Spatial Tree Carbon Prediction"])
        writer.writerow([f"# Generated,{datetime.utcnow()}"])
        writer.writerow([f"# Date Start,{start_date}"])
        writer.writerow([f"# Date End,{end_date}"])
        writer.writerow([f"# AOI Location,{aoi_address}"])
        writer.writerow([f"# AOI Area (km²),{area_km2:.3f}"])
        writer.writerow([])
        writer.writerow([f"# Analysed Pixels,{n_valid_pixels}"])
        writer.writerow([f"# Mean Tree Carbon (kg C),{df['carbon_kg'].mean():.2f}"])
        writer.writerow([f"# Sampled Carbon (kg C),{df['carbon_kg'].sum():.2f}"])
        writer.writerow([f"# Vegetation Coverage (%),{vegetation_coverage:.1f}"])
        writer.writerow([f"# Prediction Confidence,{confidence:.2f}"])
        writer.writerow([])

        # Table header
        writer.writerow([
            "pixel_id",
            "latitude",
            "longitude",
            "tree_carbon_kg",
            "carbon_class"
        ])

        # Data rows
        for i, r in df.iterrows():
            writer.writerow([
                i + 1,
                round(r["lat"], 6),
                round(r["lon"], 6),
                round(r["carbon_kg"], 2),
                r["carbon_class"]
            ])

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={
                "Content-Disposition":
                "attachment; filename=carbovista_pixel_predictions.csv"
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# DOWNLOAD PDF
# ------------------------------------------------------------
@app.route("/download-pdf", methods=["POST"])
def download_pdf():
    try:
        payload = request.get_json()
        stats = payload["stats"]
        images = payload.get("images",{})

        pdf_buffer = build_pdf(stats, images)

        return Response(
            pdf_buffer,
            mimetype="application/pdf",
            headers={
                "Content-Disposition":
                "attachment; filename=carbovista_report.pdf"
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------------------------------------------
# 6️⃣ Run server
# ------------------------------------------------------------
if __name__ == "__main__":
    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000
    )