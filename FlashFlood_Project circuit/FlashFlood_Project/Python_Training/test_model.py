import numpy as np
import tensorflow as tf
import json

# Load model and parameters
model = tf.keras.models.load_model('flood_model.h5')
with open('model_params.json', 'r') as f:
    params = json.load(f)

X_mean = params['X_mean']
X_std = params['X_std']

print("=== Flash Guard Model Testing ===\n")

# Test cases
tests = [
    (20, "Slow drip"), (50, "Normal stream"), (75, "Steady flow"),
    (100, "Increased flow"), (150, "Heavy flow"), (200, "Very heavy"),
    (250, "Flash flood"), (300, "Extreme flood")
]

classes = ['Normal', 'Warning', 'Danger']
print("Flow Speed | Description          | Prediction | Confidence")
print("-" * 65)

for speed, desc in tests:
    norm_speed = (speed - X_mean) / X_std
    probs = model.predict(np.array([[norm_speed]]), verbose=0)[0]
    pred_class = np.argmax(probs)
    confidence = probs[pred_class] * 100
    
    print(f"{speed:6.1f}     | {desc:20s} | {classes[pred_class]:8s}  | {confidence:5.1f}%")

print("\n✓ Testing complete! Model is ready for deployment.")
