import numpy as np
import pandas as pd
import joblib
import tensorflow as tf

# Load the original preprocessor
preprocessor = joblib.load("models/preprocessor.joblib")

# Create 10 test transactions using the original 17 raw features
data = pd.DataFrame({
    "transaction_type": ["transfer"] * 10,
    "channel": ["mobile_app"] * 10,
    "region": ["Central Equatoria"] * 10,
    "currency": ["SSP"] * 10,
    "amount": [1500, 1800, 2200, 1200, 3500,
               900, 1700, 2600, 1400, 2000],
    "hour_of_day": [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    "day_of_week": [2] * 10,
    "account_age_months": [24] * 10,
    "transactions_last_24h": [3] * 10,
    "failed_attempts_last_24h": [0] * 10,
    "new_recipient": [0] * 10,
    "recipient_country_mismatch": [0] * 10,
    "distance_from_usual_km": [5] * 10,
    "device_changed": [0] * 10,
    "balance_before": [10000] * 10,
    "transaction_month": [11] * 10,
    "is_weekend": [0] * 10
})

# Transform the 10 transactions
transformed = preprocessor.transform(data)

print("Raw data shape:", data.shape)
print("Transformed shape:", transformed.shape)

# Prepare the LSTM input
X_test = np.asarray(transformed, dtype=np.float32)
X_test = X_test.reshape(1, 10, 37)

print("LSTM input shape:", X_test.shape)

# Test both saved models
for path in [
    "models/best_lstm.keras",
    "models/nileguard_lstm_fraud_model.keras"
]:
    print("\nTesting:", path)

    model = tf.keras.models.load_model(path, compile=False)
    prediction = model.predict(X_test, verbose=0)

    probability = float(prediction[0][0])

    print("Output shape:", prediction.shape)
    print("Fraud probability:", probability)
    print("Prediction is finite:", np.isfinite(probability))

    assert prediction.shape == (1, 1)
    assert np.isfinite(probability)
    assert 0 <= probability <= 1

print("\nPREPROCESSING AND MODEL INTEGRATION TEST PASSED")
