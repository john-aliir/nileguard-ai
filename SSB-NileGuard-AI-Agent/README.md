# SSB-NileGuard AI Agent

A local demonstration dashboard for a South Sudan bank transaction fraud-detection project. Built with HTML, CSS, JavaScript, and a Python Flask API.

## Features
- Dashboard overview and transaction feed
- Risk badges, alerts and review queue
- Transaction test form with risk score and reasons
- Recommendations for the reviewer
- Chat-style explanation assistant
- Backend model status indicator
- Demo mode when no trained model artifact is present

## Important model note
The provided Colab link required sign-in in the review environment, so the model architecture, feature columns, and preprocessing could not be verified. The application therefore starts in DEMO MODE. Demo scores are illustrative and are not predictions from your trained model.

### Connect your actual model
1. In Colab, export your trained compatible scikit-learn/XGBoost model with `joblib` (example below).
2. Download the model file and put it in `models/fraud_model.pkl`.
3. If training used a scaler, encoder, feature selector, or other preprocessing, export those too and load/apply them in `model_service.py`.
4. Edit `prepare_features()` in `model_service.py` so the input columns, order, encodings, scaling, and types exactly match training.
5. Restart Flask and confirm the status says **Model artifact loaded**.

Example export for a compatible estimator in Colab:
```python
import joblib
joblib.dump(model, "fraud_model.pkl")
```
Then download `fraud_model.pkl` from Colab and place it in the `models` folder.

If you trained an LSTM, do not export it as though it were a tabular scikit-learn estimator. Save the Keras model and implement the correct sequence preparation and inference in `model_service.py`, using the exact sequence length and feature order used in training. The included adapter is a starting point, not a universal LSTM loader.

## Run in VS Code on Windows
1. Install Python 3.10+ and Visual Studio Code.
2. Extract this ZIP and open the `SSB-NileGuard-AI-Agent` folder in VS Code.
3. Open Terminal > New Terminal.
4. Create a virtual environment:
   ```powershell
   py -m venv .venv
   ```
5. Activate it:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
   If PowerShell blocks activation, run this for the current terminal only:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\.venv\Scripts\Activate.ps1
   ```
6. Install requirements:
   ```powershell
   python -m pip install -r requirements.txt
   ```
7. Start the app:
   ```powershell
   python app.py
   ```
8. Open `http://127.0.0.1:5000` in your browser.

## Demo transactions
The dashboard includes synthetic sample transactions. They are for interface testing only and are not real customer records. Use only authorized, anonymized data for demonstrations.

## Suggested demo flow
1. Show the overview and explain the risk indicators.
2. Open **Analyze Transaction**, enter a sample transaction, and run the analysis.
3. Review the risk score, reasons, and suggested actions.
4. Ask the chat assistant why the transaction was flagged.
5. Show model status to explain the difference between demo mode and connected-model mode.

## Responsible use
This is a student demonstration prototype, not a production banking security system. Do not use its outputs to automatically freeze accounts or deny transactions. Validate performance on representative data, assess false positives/false negatives, protect customer information, and require authorized human review.
