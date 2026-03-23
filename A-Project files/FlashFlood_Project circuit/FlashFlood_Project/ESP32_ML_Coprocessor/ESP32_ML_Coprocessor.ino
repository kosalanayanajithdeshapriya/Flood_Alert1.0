#define RX_FROM_UNO 16
#define TX_TO_UNO   17

const float WARN_LMIN   = 5.0;
const float DANGER_LMIN = 15.0;

int classifyFlow(float flow) {
  if (flow >= DANGER_LMIN) return 2;
  if (flow >= WARN_LMIN)   return 1;
  return 0;
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RX_FROM_UNO, TX_TO_UNO);
  Serial.println("ESP32 classifier ready.");
}

void loop() {
  if (!Serial2.available()) return;

  String line = Serial2.readStringUntil('\n');
  line.trim();

  if (line.startsWith("F,")) {
    float flow = line.substring(2).toFloat();
    int state = classifyFlow(flow);

    Serial2.print("S,");
    Serial2.print(state);
    Serial2.print("\n");

    Serial.print("RX: ");
    Serial.print(line);
    Serial.print("  -> flow=");
    Serial.print(flow, 2);
    Serial.print("  state=");
    Serial.println(state);
  }
}
