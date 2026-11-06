from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd

# This file is inside the nested Flask folder.
# Model artifacts and metadata are in the outer project folder.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = PROJECT_ROOT / "models" / "best_lstm.keras"
PREPROCESSOR_PATH = PROJECT_ROOT / "models" / "preprocessor.joblib"
METADATA_PATH = PROJECT_ROOT / "config" / "metadata.json"

_model = None
_preprocessor = None
_metadata = None
_load_error = None


def _load_artifacts():
    global _model, _preprocessor, _metadata, _load_error

    if _model is not None and _preprocessor is not None and _metadata is not None:
        return True

    try:
        for path in (MODEL_PATH, PREPROCESSOR_PATH, METADATA_PATH):
            if not path.exists():
                raise FileNotFoundError(f"Required artifact not found: {path}")

        with open(METADATA_PATH, "r", encoding="utf-8") as file:
            metadata = json.load(file)

        preprocessor = joblib.load(PREPROCESSOR_PATH)

        from tensorflow.keras.models import load_model
        model = load_model(MODEL_PATH, compile=False)

        expected_features = len(preprocessor.get_feature_names_out())
        model_features = int(model.input_shape[-1])
        sequence_length = int(metadata["sequence_length"])

        if expected_features != model_features:
            raise ValueError(
                f"Preprocessor produces {expected_features} features, "
                f"but the LSTM expects {model_features}."
            )

        if int(model.input_shape[1]) != sequence_length:
            raise ValueError(
                f"Metadata sequence length is {sequence_length}, "
                f"but model expects {model.input_shape[1]}."
            )

        _model = model
        _preprocessor = preprocessor
        _metadata = metadata
        _load_error = None
        return True

    except Exception as exc:
        _load_error = f"{type(exc).__name__}: {exc}"
        _model = None
        _preprocessor = None
        _metadata = None
        return False


def get_model_status():
    if not _load_artifacts():
        return {
            "mode": "error",
            "label": "Model unavailable",
            "detail": _load_error or "Could not load the trained LSTM artifacts."
        }

    return {
        "mode": "connected",
        "label": "Trained LSTM connected",
        "detail": (
            f"Loaded {MODEL_PATH.name} with "
            f"{len(_preprocessor.get_feature_names_out())} transformed features "
            f"and a sequence length of {_metadata['sequence_length']}."
        )
    }


def recommendations(level):
    if level == "High risk":
        return [
            "Prioritize this transaction for authorized manual review.",
            "Verify the customer through an approved independent channel.",
            "Review recent account activity and transaction history.",
            "Document the review and follow the institution's escalation procedure."
        ]

    if level == "Review":
        return [
            "Compare the transaction with the customer's normal activity.",
            "Check recent transaction patterns and relevant account information.",
            "Apply additional verification according to bank policy."
        ]

    return [
        "Continue normal monitoring and standard bank controls.",
        "Retain the transaction record for audit and ongoing monitoring."
    ]


def predict_csv_frame(frame):
    if not _load_artifacts():
        raise RuntimeError(_load_error or "The trained model could not be loaded.")

    if not isinstance(frame, pd.DataFrame) or frame.empty:
        raise ValueError("The uploaded CSV contains no transaction rows.")

    feature_columns = _metadata["feature_columns_raw"]
    missing = [column for column in feature_columns if column not in frame.columns]

    if missing:
        raise ValueError(
            "The CSV is missing required training features: " + ", ".join(missing)
        )

    data = frame.copy()
    original_positions = np.arange(len(data))

    # Use timestamps for chronological ordering when supplied.
    if "transaction_datetime" in data.columns:
        timestamps = pd.to_datetime(
            data["transaction_datetime"], errors="coerce"
        )

        if timestamps.isna().any():
            raise ValueError(
                "Some transaction_datetime values are invalid. "
                "Use valid timestamps or remove this column and provide rows "
                "already arranged in chronological order."
            )

        data["_original_position"] = original_positions
        data["_sort_timestamp"] = timestamps
        data = data.sort_values(
            ["_sort_timestamp", "_original_position"],
            kind="stable"
        ).reset_index(drop=True)

    if len(data) < int(_metadata["sequence_length"]):
        raise ValueError(
            f"At least {_metadata['sequence_length']} transactions are required. "
            f"Your file contains {len(data)}."
        )

    features = data[feature_columns].copy()

    # Ensure numeric columns are numeric; the saved preprocessor handles
    # missing values according to its original training configuration.
    for column in _metadata["numeric_columns"]:
        features[column] = pd.to_numeric(features[column], errors="coerce")

    transformed = _preprocessor.transform(features)

    if hasattr(transformed, "toarray"):
        transformed = transformed.toarray()

    transformed = np.asarray(transformed, dtype=np.float32)

    if transformed.ndim != 2 or not np.isfinite(transformed).all():
        raise ValueError(
            "Preprocessing produced invalid feature values. "
            "Check the uploaded transaction data."
        )

    sequence_length = int(_metadata["sequence_length"])

    # Each sequence contains the current transaction and its preceding
    # sequence_length - 1 rows, matching the training window length.
    sequences = np.stack([
        transformed[end - sequence_length + 1:end + 1]
        for end in range(sequence_length - 1, len(transformed))
    ]).astype(np.float32)

    probabilities = _model.predict(sequences, verbose=0).reshape(-1)

    threshold = float(_metadata["decision_threshold_selected_on_validation"])
    results = []

    for index, probability in enumerate(probabilities):
        probability = float(np.clip(probability, 0.0, 1.0))
        is_alert = probability >= threshold

        if probability >= 0.65:
            level = "High risk"
        elif is_alert:
            level = "Review"
        else:
            level = "Low risk"

        row = data.iloc[index + sequence_length - 1]

        transaction_id = row.get("transaction_id", None)
        if pd.isna(transaction_id) if transaction_id is not None else True:
            transaction_id = f"CSV-ROW-{index + sequence_length}"

        amount = row.get("amount", None)
        currency = row.get("currency", None)
        tx_type = row.get("transaction_type", None)
        region = row.get("region", None)

        results.append({
            "id": str(transaction_id),
            "transaction_id": str(transaction_id),
            "amount": float(amount) if pd.notna(amount) else None,
            "currency": str(currency) if pd.notna(currency) else None,
            "type": str(tx_type) if pd.notna(tx_type) else None,
            "location": str(region) if pd.notna(region) else None,
            "risk_score": round(probability * 100, 2),
            "risk_level": level,
            "prediction": "Potential fraud alert" if is_alert else "No fraud alert",
            "predicted_fraud": bool(is_alert),
            "decision_threshold": threshold,
            "reasons": [
                "LSTM sequence risk score generated from the current transaction "
                "and its preceding transaction history."
            ],
            "recommendations": recommendations(level),
            "is_demo": False
        })

    return results


def explain_question(question, context=None):
    q = question.lower()
    context = context or {}

    if any(word in q for word in ["why", "reason", "explain"]):
        if context.get("risk_level"):
            return (
                f"The LSTM assigned this transaction a {context['risk_level']} "
                f"classification with a score of {context.get('risk_score')}%. "
                "This score is based on a 10-transaction sequence. It is a "
                "screening signal, not proof of fraud. A human reviewer should "
                "examine the underlying transaction history."
            )

        return (
            "NileGuard evaluates a chronological window of 10 transactions. "
            "The model produces a risk score from patterns in the sequence. "
            "Upload a suitable CSV to obtain an assessment."
        )

    if any(word in q for word in ["recommend", "next step", "what should", "action"]):
        level = context.get("risk_level", "")
        return " ".join(recommendations(level))

    if any(word in q for word in ["model", "lstm", "trained", "connected"]):
        status = get_model_status()
        return f"{status['label']}. {status['detail']}"

    if any(word in q for word in ["false positive", "accuracy", "precision", "recall"]):
        return (
            "A false positive occurs when a legitimate transaction receives a "
            "fraud alert. Accuracy alone is not enough to evaluate fraud models. "
            "Precision, recall, the confusion matrix, and the cost of missed "
            "fraud must also be considered."
        )

    return (
        "I can explain LSTM risk scores, transaction sequences, model evaluation, "
        "false positives, and recommended review procedures. Ask me about any "
        "of these topics."
    )
