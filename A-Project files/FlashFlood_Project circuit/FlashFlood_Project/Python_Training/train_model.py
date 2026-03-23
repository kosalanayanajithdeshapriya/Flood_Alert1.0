import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib.pyplot as plt
import json

print("TensorFlow version:", tf.__version__)

# Load data
print("\n=== Loading Data ===")
data = pd.read_csv('flow_data.csv')
X = data[['flow_speed']].values
y = data['label'].values

print(f"Total samples: {len(X)}")
print(f"Class distribution: Normal={np.sum(y==0)}, Warning={np.sum(y==1)}, Danger={np.sum(y==2)}")

# Normalize input
X_mean = float(X.mean())
X_std = float(X.std())
X_normalized = (X - X_mean) / X_std

print(f"\nNormalization: mean={X_mean:.2f}, std={X_std:.2f}")

# Split data
X_train, X_temp, y_train, y_temp = train_test_split(
    X_normalized, y, test_size=0.3, random_state=42, stratify=y
)
X_val, X_test, y_val, y_test = train_test_split(
    X_temp, y_temp, test_size=0.5, random_state=42, stratify=y_temp
)

print(f"\nTraining: {len(X_train)}, Validation: {len(X_val)}, Test: {len(X_test)}")

# One-hot encoding
y_train_onehot = keras.utils.to_categorical(y_train, 3)
y_val_onehot = keras.utils.to_categorical(y_val, 3)
y_test_onehot = keras.utils.to_categorical(y_test, 3)

# Build model
print("\n=== Building Model ===")
model = keras.Sequential([
    keras.layers.Input(shape=(1,)),
    keras.layers.Dense(8, activation='relu', name='hidden_layer'),
    keras.layers.Dense(3, activation='softmax', name='output_layer')
])

model.summary()

model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

# Train
print("\n=== Training Model ===")
history = model.fit(
    X_train, y_train_onehot,
    validation_data=(X_val, y_val_onehot),
    epochs=100,
    batch_size=32,
    verbose=1
)

# Evaluate
print("\n=== Evaluation ===")
test_loss, test_accuracy = model.evaluate(X_test, y_test_onehot, verbose=0)
print(f"Test Accuracy: {test_accuracy*100:.2f}%")

y_pred = np.argmax(model.predict(X_test, verbose=0), axis=1)
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=['Normal', 'Warning', 'Danger']))
print("\nConfusion Matrix:")
print(confusion_matrix(y_test, y_pred))

# Save model
model.save('flood_model.h5')
print("\n✓ Model saved to 'flood_model.h5'")

# Extract parameters
params = {'X_mean': X_mean, 'X_std': X_std, 'layers': []}
for layer in model.layers:
    weights = layer.get_weights()
    if len(weights) > 0:
        params['layers'].append({
            'name': layer.name,
            'weights': weights[0].tolist(),
            'biases': weights[1].tolist()
        })

with open('model_params.json', 'w') as f:
    json.dump(params, f, indent=2)
print("✓ Parameters saved to 'model_params.json'")

# Generate C header
with open('model_params.h', 'w') as f:
    f.write("// Flash Guard Model Parameters\n")
    f.write("#ifndef MODEL_PARAMS_H\n#define MODEL_PARAMS_H\n\n")
    f.write(f"#define X_MEAN {X_mean:.6f}f\n")
    f.write(f"#define X_STD {X_std:.6f}f\n\n")
    
    hidden = params['layers'][0]
    f.write(f"const float W1[8] = {{")
    f.write(", ".join([f"{w:.6f}f" for w in hidden['weights'][0]]))
    f.write("};\n\n")
    f.write(f"const float B1[8] = {{")
    f.write(", ".join([f"{b:.6f}f" for b in hidden['biases']]))
    f.write("};\n\n")
    
    output = params['layers'][1]
    f.write(f"const float W2[8][3] = {{\n")
    for i, row in enumerate(output['weights']):
        f.write("  {" + ", ".join([f"{w:.6f}f" for w in row]) + "}")
        if i < 7: f.write(",")
        f.write("\n")
    f.write("};\n\n")
    f.write(f"const float B2[3] = {{")
    f.write(", ".join([f"{b:.6f}f" for b in output['biases']]))
    f.write("};\n\n#endif\n")

print("✓ C header saved to 'model_params.h'")

# Plot training history
plt.figure(figsize=(12, 5))
plt.subplot(1, 2, 1)
plt.plot(history.history['accuracy'], label='Train')
plt.plot(history.history['val_accuracy'], label='Validation')
plt.xlabel('Epoch')
plt.ylabel('Accuracy')
plt.title('Model Accuracy')
plt.legend()
plt.grid(True, alpha=0.3)

plt.subplot(1, 2, 2)
plt.plot(history.history['loss'], label='Train')
plt.plot(history.history['val_loss'], label='Validation')
plt.xlabel('Epoch')
plt.ylabel('Loss')
plt.title('Model Loss')
plt.legend()
plt.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('training_history.png', dpi=300)
print("✓ Training plots saved")
plt.show()
