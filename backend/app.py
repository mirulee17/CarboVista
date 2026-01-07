# ============================================================
# CARBOVISTA — FLASK BACKEND
# Supports:
#   1) Point-based ACD prediction (/predict)
#   2) AOI-based spatial analysis (/run-analysis)
# ============================================================

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os

from gee_utils import init_ee, extract_s2_pixels

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
        # 4️⃣ Carbon + Area calculation
        # --------------------------------------------------
        PIXEL_AREA_HA = 0.01  # 10m × 10m Sentinel-2

        df["carbon_tc"] = df["carbon_kg"] * PIXEL_AREA_HA

        total_carbon = float(df["carbon_tc"].sum())
        area_ha = float(len(df) * PIXEL_AREA_HA)

        # --------------------------------------------------
        # 5️⃣ Build GeoJSON for GIS
        # --------------------------------------------------
        geojson_features = []

        for _, r in df.iterrows():
            geojson_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [r["lon"], r["lat"]]
                },
                "properties": {
                    "acd": round(float(r["carbon_kg"]), 2)
                }
            })

        geojson = {
            "type": "FeatureCollection",
            "features": geojson_features
        }

        # --------------------------------------------------
        # 6️⃣ Dashboard statistics
        # --------------------------------------------------
        stats = {
            "n_pixels": int(len(df)),
            "mean_acd": float(df["carbon_kg"].mean()),
            "min_acd": float(df["carbon_kg"].min()),
            "max_acd": float(df["carbon_kg"].max()),
            "std_acd": float(df["carbon_kg"].std()),
            "area_ha": round(area_ha, 2),
            "total_carbon": round(total_carbon, 2)
        }

        return jsonify({
            "stats": stats,
            "geojson": geojson
        })

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