import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Set random seed for reproducibility
np.random.seed(42)

# Define flow speed ranges for each class (based on YF-S201 characteristics)
NORMAL_RANGE = (10, 80)      # Low flow - Safe
WARNING_RANGE = (80, 180)    # Moderate flow - Caution
DANGER_RANGE = (180, 350)    # High flow - Flash Flood

def generate_class_data(flow_range, label, num_samples=300):
    """Generate synthetic flow sensor data with realistic noise"""
    mean_flow = (flow_range[0] + flow_range[1]) / 2
    std_flow = (flow_range[1] - flow_range[0]) / 6
    
    flow_speeds = np.random.normal(mean_flow, std_flow, num_samples)
    flow_speeds = np.clip(flow_speeds, flow_range[0], flow_range[1])
    
    # Add sensor noise
    noise = np.random.normal(0, 5, num_samples)
    flow_speeds += noise
    
    timestamps = np.arange(num_samples) * 1000
    labels = np.full(num_samples, label)
    
    return timestamps, flow_speeds, labels

print("Generating simulated flow sensor data...")

# Generate data for all classes
t_normal, speed_normal, label_normal = generate_class_data(NORMAL_RANGE, 0, 300)
t_warning, speed_warning, label_warning = generate_class_data(WARNING_RANGE, 1, 300)
t_danger, speed_danger, label_danger = generate_class_data(DANGER_RANGE, 2, 300)

# Combine all data
timestamps = np.concatenate([t_normal, t_warning, t_danger])
flow_speeds = np.concatenate([speed_normal, speed_warning, speed_danger])
labels = np.concatenate([label_normal, label_warning, label_danger])

# Create DataFrame and shuffle
data = pd.DataFrame({
    'timestamp': timestamps,
    'flow_speed': flow_speeds,
    'label': labels
})
data = data.sample(frac=1, random_state=42).reset_index(drop=True)

# Save to CSV
data.to_csv('flow_data.csv', index=False)
print(f"✓ Generated {len(data)} samples and saved to 'flow_data.csv'")

# Visualize
plt.figure(figsize=(12, 6))

plt.subplot(1, 2, 1)
colors = ['green', 'yellow', 'red']
names = ['Normal', 'Warning', 'Danger']
for label_val, color, name in zip([0, 1, 2], colors, names):
    class_data = data[data['label'] == label_val]
    plt.scatter(class_data.index, class_data['flow_speed'], 
                c=color, alpha=0.6, label=name, s=20)
plt.xlabel('Sample Index')
plt.ylabel('Flow Speed (units)')
plt.title('Simulated Flow Sensor Data Distribution')
plt.legend()
plt.grid(True, alpha=0.3)

plt.subplot(1, 2, 2)
for label_val, color, name in zip([0, 1, 2], colors, names):
    class_data = data[data['label'] == label_val]['flow_speed']
    plt.hist(class_data, bins=30, alpha=0.5, label=name, color=color)
plt.xlabel('Flow Speed (units)')
plt.ylabel('Frequency')
plt.title('Flow Speed Distribution by Class')
plt.legend()
plt.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('data_visualization.png', dpi=300)
print("✓ Saved visualization to 'data_visualization.png'")
plt.show()

# Print statistics
print("\n=== Data Statistics ===")
for label_val, name in [(0, 'Normal'), (1, 'Warning'), (2, 'Danger')]:
    class_data = data[data['label'] == label_val]['flow_speed']
    print(f"{name:10s}: Mean={class_data.mean():.2f}, Std={class_data.std():.2f}, "
          f"Min={class_data.min():.2f}, Max={class_data.max():.2f}")
