import joblib

path = "models/preprocessor.joblib"
preprocessor = joblib.load(path)

print("=" * 60)
print("PREPROCESSOR INSPECTION")
print("=" * 60)

print("\nPreprocessor type:")
print(type(preprocessor))

print("\nPreprocessor configuration:")
print(preprocessor)

if hasattr(preprocessor, "feature_names_in_"):
    print("\nOriginal input features:")
    print(list(preprocessor.feature_names_in_))

if hasattr(preprocessor, "get_feature_names_out"):
    print("\nTransformed feature names:")
    print(list(preprocessor.get_feature_names_out()))

if hasattr(preprocessor, "transformers_"):
    print("\nIndividual preprocessing transformers:")
    for name, transformer, columns in preprocessor.transformers_:
        print(f"\n{name}:")
        print("Columns:", columns)
        print("Transformer:", transformer)
