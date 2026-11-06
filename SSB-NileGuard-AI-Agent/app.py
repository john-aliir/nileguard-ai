
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
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB


@app.route("/")
def index():
    return render_template("index.html", model_status=get_model_status())


@app.get("/api/status")
def status():
    return jsonify(get_model_status())


@app.get("/api/transactions")
def transactions():
    # No invented or incomplete sample records are presented as LSTM results.
    return jsonify({
        "transactions": [],
        "message": "Upload a chronological transaction CSV to generate real LSTM assessments.",
    })


@app.post("/api/predict-csv")
def predict_csv():
    uploaded = request.files.get("file")

    if uploaded is None or not uploaded.filename:
        return jsonify({"error": "Select a CSV file to upload."}), 400

    if not uploaded.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only CSV files are accepted."}), 400

    try:
        frame = pd.read_csv(BytesIO(uploaded.read()))

        if frame.empty:
            return jsonify({"error": "The uploaded CSV contains no transaction rows."}), 400

        results = predict_csv_frame(frame)

        return jsonify({
            "success": True,
            "model_status": get_model_status(),
            "uploaded_rows": len(frame),
            "predictions_count": len(results),
            "sequence_length": 10,
            "target_alignment": "Each prediction refers to the final transaction in its 10-row window.",
            "predictions": results,
            "notice": (
                "Experimental decision-support output from the trained LSTM. "
                "A model alert is not proof of fraud. Human review is required."
            ),
        })

    except pd.errors.EmptyDataError:
        return jsonify({"error": "The CSV file is empty or unreadable."}), 400
    except pd.errors.ParserError as exc:
        return jsonify({"error": f"Could not parse CSV: {exc}"}), 400
    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        app.logger.exception("NileGuard CSV prediction failed")
        return jsonify({
            "error": f"Prediction failed: {type(exc).__name__}: {exc}"
        }), 500


@app.post("/api/chat")
def chat():
    body = request.get_json(silent=True) or {}
    question = str(body.get("message", "")).strip()
    context = body.get("transaction") or {}

    if not question:
        return jsonify({"reply": "Ask me about the LSTM model, risk scores, or review recommendations."})

    return jsonify({"reply": explain_question(question, context)})


@app.errorhandler(RequestEntityTooLarge)
def file_too_large(_error):
    return jsonify({"error": "CSV file is too large. The maximum upload size is 10 MB."}), 413


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
