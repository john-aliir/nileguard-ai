import tensorflow as tf

models = [
    "models/best_lstm.keras",
    "models/nileguard_lstm_fraud_model.keras"
]

for path in models:
    print("\n" + "=" * 60)
    print("MODEL:", path)

    model = tf.keras.models.load_model(path, compile=False)

    print("Input shape:", model.input_shape)
    print("Output shape:", model.output_shape)
    print("Parameters:", model.count_params())

    model.summary()
