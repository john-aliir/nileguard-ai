from io import BytesIO

import pandas as pd
from flask import Flask, render_template, request, jsonify
from werkzeug.exceptions import RequestEntityTooLarge

from model_service import (
    get_model_status,
    predict_csv_frame,
    explain_question,
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Allow only the deployed NileGuard Vercel frontend.
ALLOWED_ORIGIN = "https://nileguard-ai-vercel-frontend.vercel.app"


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")

    if origin == ALLOWED_ORIGIN:
        response.headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = (
    "Content-Type, ngrok-skip-browser-warning")
        response.headers["Access-Control-Max-Age"] = "600"
        response.headers["Vary"] = "Origin"

    return response


@app.route("/")
def index():
    return render_template("index.html", model_status=get_model_status())


@app.get("/api/status")
def status():
    return jsonify(get_model_status())


@app.get("/api/transactions")
def transactions():
    return jsonify({
        "transactions": [],
        "message": (
            "No transaction feed is configured. Upload a chronological "
            "CSV file to generate LSTM assessments."
        )
    })


@app.route("/api/predict-csv", methods=["POST", "OPTIONS"])
def predict_csv():
    if request.method == "OPTIONS":
        return "", 204

    uploaded = request.files.get("file")

    if uploaded is None or not uploaded.filename:
        return jsonify({"error": "Select a CSV file to upload."}), 400

    if not uploaded.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only CSV files are accepted."}), 400

    try:
        frame = pd.read_csv(BytesIO(uploaded.read()))

        if frame.empty:
            return jsonify({
                "error": "The uploaded CSV contains no transaction rows."
            }), 400

        predictions = predict_csv_frame(frame)

        high_count = sum(
            item["risk_level"] == "High risk" for item in predictions
        )
        review_count = sum(
            item["risk_level"] == "Review" for item in predictions
        )
        alert_count = sum(
            item["predicted_fraud"] for item in predictions
        )

        return jsonify({
            "success": True,
            "model_status": get_model_status(),
            "uploaded_rows": len(frame),
            "predictions_count": len(predictions),
            "sequence_length": 10,
            "alert_count": alert_count,
            "high_risk_count": high_count,
            "review_count": review_count,
            "predictions": predictions,
            "notice": (
                "Experimental LSTM decision-support output. "
                "An alert is not proof of fraud. Human review is required."
            )
        })

    except pd.errors.EmptyDataError:
        return jsonify({"error": "The CSV file is empty or unreadable."}), 400

    except pd.errors.ParserError as exc:
        return jsonify({"error": f"Could not parse CSV: {exc}"}), 400

    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400

    except RuntimeError as exc:
        app.logger.exception("LSTM model unavailable")
        return jsonify({"error": str(exc)}), 503

    except Exception as exc:
        app.logger.exception("NileGuard CSV prediction failed")
        return jsonify({
            "error": f"Prediction failed: {type(exc).__name__}: {exc}"
        }), 500


@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return "", 204

    body = request.get_json(silent=True) or {}
    question = str(body.get("message", "")).strip()
    context = body.get("transaction") or {}

    if not question:
        return jsonify({
            "reply": "Ask me about the LSTM model, risk scores, or review recommendations."
        }), 400

    return jsonify({
        "reply": explain_question(question, context)
    })


@app.errorhandler(RequestEntityTooLarge)
def file_too_large(_error):
    return jsonify({
        "error": "CSV file is too large. The maximum upload size is 10 MB."
    }), 413


if __name__ == "__main__":
    app.run(
        debug=False,
        host="127.0.0.1",
        port=5000
    )
