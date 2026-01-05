# ============================================================
# CARBOVISTA — FLASK BACKEND (FINAL)
# Model: Random Forest ACD Predictor
# ============================================================

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os

# ------------------------------------------------------------
# 1️⃣ Initialize Flask
# ------------------------------------------------------------
app = Flask(__name__)
CORS(app)  # allow frontend JS to call backend

# ------------------------------------------------------------
# 2️⃣ Load trained model
# ------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "model",
    "RF_ACD_FINAL_DEPLOYMENT_MODEL.joblib"
)

model_bundle = joblib.load(MODEL_PATH)

rf_model = model_bundle["model"]
FEATURES = model_bundle["features"]

print("✅ Model loaded successfully")
print("✅ Expected features:", FEATURES)

# ------------------------------------------------------------
# 3️⃣ Health check route
# ------------------------------------------------------------
@app.route("/", methods=["GET"])
def health_check():
    return jsonify({
        "status": "CarboVista backend running",
        "model": "Random Forest ACD"
    })

# ------------------------------------------------------------
# 4️⃣ Prediction endpoint
# ------------------------------------------------------------
@app.route("/predict", methods=["POST"])
def predict_acd():

    try:
        data = request.get_json()

        # Convert input to DataFrame (correct order)
        X_user = pd.DataFrame([data])[FEATURES]
        X_np = X_user.values

        # Tree-wise predictions (uncertainty)
        tree_preds = np.array([
            tree.predict(X_np)[0]
            for tree in rf_model.estimators_
        ])

        mean_pred = float(tree_preds.mean())
        std_pred  = float(tree_preds.std())

        # 95% confidence interval
        ci_lower = max(0.0, mean_pred - 1.96 * std_pred)
        ci_upper = mean_pred + 1.96 * std_pred

        # Confidence score (0–1)
        confidence = float(np.exp(-std_pred / mean_pred)) if mean_pred > 0 else 0.0
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
        return jsonify({
            "error": str(e)
        }), 400

# ------------------------------------------------------------
# 5️⃣ Run server
# ------------------------------------------------------------
if __name__ == "__main__":
    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000
    )
