"""
Model adapter for SSB-NileGuard.
Put your trained model artifact(s) in /models and configure MODEL_PATH below.

Supported starting point: scikit-learn/XGBoost-style estimators saved with joblib
that accept one row of tabular transaction features. If your notebook uses an LSTM,
sequence windows, custom encoders/scalers, or a different feature order, update
prepare_features() to match the exact preprocessing used during training.
"""
from pathlib import Path
import os
import numpy as np

ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv("NILEGUARD_MODEL_PATH", ROOT / "models" / "fraud_model.pkl"))
_model = None
_load_error = None

def _load_model():
    global _model, _load_error
    if _model is not None:
        return _model
    if not MODEL_PATH.exists():
        _load_error = f"No model file found at {MODEL_PATH}"
        return None
    try:
        import joblib
        _model = joblib.load(MODEL_PATH)
        _load_error = None
    except Exception as exc:
        _load_error = str(exc)
    return _model

def get_model_status():
    model = _load_model()
    if model is not None:
        return {"mode": "connected", "label": "Model artifact loaded", "detail": f"Loaded: {MODEL_PATH.name}"}
    return {"mode": "demo", "label": "Demo mode", "detail": "No compatible trained model loaded. Predictions are illustrative, not real model outputs."}

def prepare_features(tx):
    """
    IMPORTANT: Replace this mapping with the exact feature columns and encodings
    from your Colab notebook. Keep the same order and preprocessing used in training.
    """
    amount = float(tx.get("amount", 0))
    hour = int(tx.get("hour", 12))
    balance = float(tx.get("balance", 0))
    device_change = int(tx.get("device_change", 0))
    tx_type = str(tx.get("type", "POS")).upper()
    location = str(tx.get("location", "Juba")).lower()

    # Example feature mapping only. Change to match your training columns.
    type_code = {"POS": 0, "TRANSFER": 1, "MOBILE_MONEY": 2, "WITHDRAWAL": 3}.get(tx_type, 0)
    unknown_location = int(location in {"unknown", "unrecognized", "foreign"})
    return np.array([[amount, hour, balance, device_change, type_code, unknown_location]], dtype=float)

def _demo_prediction(tx):
    """Clearly labelled illustrative fallback for UI demonstrations only."""
    amount = float(tx.get("amount", 0))
    hour = int(tx.get("hour", 12))
    device_change = int(tx.get("device_change", 0))
    location = str(tx.get("location", "")).lower()
    tx_type = str(tx.get("type", "")).upper()

    score = 0.04
    reasons = []
    if amount >= 2000:
        score += 0.38; reasons.append("Unusually high transaction amount")
    elif amount >= 800:
        score += 0.19; reasons.append("Large transaction amount")
    if hour < 5 or hour >= 23:
        score += 0.20; reasons.append("Transaction occurred at an unusual hour")
    if device_change:
        score += 0.23; reasons.append("New or changed device indicator")
    if location in {"unknown", "unrecognized", "foreign"}:
        score += 0.20; reasons.append("Location is not recognized")
    if tx_type in {"TRANSFER", "WITHDRAWAL"} and amount >= 800:
        score += 0.08; reasons.append("High-value transfer or withdrawal")
    score = min(score, 0.98)
    label = "High risk" if score >= 0.65 else ("Review" if score >= 0.30 else "Low risk")
    if not reasons:
        reasons = ["No strong demo risk indicators were triggered"]
    return {
        "risk_score": round(score * 100, 1),
        "risk_level": label,
        "prediction": "Potential fraud" if score >= 0.65 else ("Needs review" if score >= 0.30 else "Likely legitimate"),
        "reasons": reasons,
        "recommendations": recommendations(label, reasons),
        "is_demo": True
    }

def recommendations(level, reasons):
    if level == "High risk":
        return [
            "Hold for manual review before completing the transaction, where bank policy permits.",
            "Verify the customer through an approved, independent contact channel.",
            "Review recent account activity, device history, and beneficiary details.",
            "Document the decision and escalate according to the bank's fraud procedure."
        ]
    if level == "Review":
        return [
            "Request an additional verification step under the bank's policy.",
            "Compare the transaction with the customer's normal activity.",
            "Check device, location, and recent transaction history before deciding."
        ]
    return [
        "Continue standard monitoring and apply normal bank controls.",
        "Keep an audit record and watch for repeated unusual activity."
    ]

def predict_transaction(tx):
    model = _load_model()
    if model is None:
        return _demo_prediction(tx)
    try:
        features = prepare_features(tx)
        pred = model.predict(features)[0]
        probability = None
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(features)[0]
            classes = list(getattr(model, "classes_", range(len(probs))))
            # Try to identify the positive/fraud class, otherwise use the last class.
            fraud_idx = next((i for i, c in enumerate(classes) if str(c).lower() in {"1", "fraud", "fraudulent", "true"}), len(probs)-1)
            probability = float(probs[fraud_idx])
        else:
            probability = 1.0 if str(pred).lower() in {"1", "fraud", "fraudulent", "true"} else 0.0
        level = "High risk" if probability >= 0.65 else ("Review" if probability >= 0.30 else "Low risk")
        reasons = ["Model output should be reviewed alongside bank rules and transaction history."]
        return {
            "risk_score": round(probability * 100, 1),
            "risk_level": level,
            "prediction": "Potential fraud" if level == "High risk" else ("Needs review" if level == "Review" else "Likely legitimate"),
            "reasons": reasons,
            "recommendations": recommendations(level, reasons),
            "is_demo": False
        }
    except Exception as exc:
        return {"error": f"Model prediction failed: {exc}", "risk_score": 0, "risk_level": "Unavailable",
                "prediction": "Could not score", "reasons": ["Check model input columns and preprocessing."],
                "recommendations": ["Update prepare_features() to match the training notebook."], "is_demo": False}

def explain_question(question, context=None):
    q = question.lower()
    context = context or {}
    score = context.get("risk_score")
    level = context.get("risk_level")
    if any(w in q for w in ["why", "reason", "explain"]):
        if level:
            reasons = context.get("reasons") or []
            return f"This transaction is marked **{level}** with a displayed risk score of {score}%. Indicators: " + "; ".join(reasons) + ". Treat this as a decision-support signal, not proof of fraud."
        return "A fraud score is an estimate based on patterns learned from transaction data. Review amount, transaction type, time, location, device changes, and the customer's normal history. Select a transaction or run a test to get a more specific explanation."
    if any(w in q for w in ["recommend", "what should", "next step", "action"]):
        if level == "High risk":
            return "Recommended: pause for review where permitted, verify the customer through an approved independent channel, inspect recent account/device activity, and follow the bank's escalation policy."
        return "Recommended: compare with the customer's usual activity, verify unusual details using bank-approved controls, and document the review. Do not block a customer based only on this demo."
    if any(w in q for w in ["model", "lstm", "ai", "trained"]):
        status = get_model_status()
        if status["mode"] == "demo":
            return "The interface is running in DEMO MODE; its sample risk scores come from illustrative rules, not your trained Colab model. To use your actual model, export the model and required preprocessing artifacts, place them in the models folder, and align prepare_features() with the notebook's exact input columns. LSTM models also require the same sequence window shape used during training."
        return "A model artifact is loaded. Confirm that the feature mapping and preprocessing match the training notebook before interpreting results. This agent supports fraud review; it does not replace bank controls or investigator judgement."
    if any(w in q for w in ["false positive", "mistake", "accuracy"]):
        return "A false positive is a legitimate transaction flagged for review. Evaluate precision, recall, the confusion matrix, and the cost of missed fraud versus unnecessary reviews. Do not rely on accuracy alone, especially when fraud cases are rare."
    return "I can explain risk scores, common fraud indicators, review recommendations, model integration, and evaluation metrics. Try asking: “Why was this transaction flagged?”, “What should the reviewer do next?”, or “Is the trained model connected?”"
