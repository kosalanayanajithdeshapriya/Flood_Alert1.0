#include <SoftwareSerial.h>
#include <Wire.h>
#include <U8x8lib.h>

#define FLOW_PIN 2
#define LED_G 8
#define LED_Y 9
#define LED_R 10
#define BUZZ  11

// UNO RX=D4 (from ESP32 TX17), UNO TX=D5 (to ESP32 RX16 via divider)
SoftwareSerial link(4, 5);

// OLED (I2C) low-RAM text mode: 16 cols x 8 rows
U8X8_SSD1306_128X64_NONAME_HW_I2C oled(U8X8_PIN_NONE);

// Flow sensor calibration (YF-S201 typical)
const float CAL_FACTOR = 7.5;

// Thresholds
const float WARN_LMIN   = 5.0;
const float DANGER_LMIN = 15.0;

volatile unsigned long pulseCount = 0;
void pulseISR() { pulseCount++; }

void setOutputs(int s) {
  digitalWrite(LED_G, s == 0);
  digitalWrite(LED_Y, s == 1);
  digitalWrite(LED_R, s == 2);
  digitalWrite(BUZZ,  s == 2);
}

int fallbackState(float flowLmin) {
  if (flowLmin >= DANGER_LMIN) return 2;
  if (flowLmin >= WARN_LMIN) return 1;
  return 0;
}

const char* stateToText(int s) {
  if (s == 2) return "DANGER";
  if (s == 1) return "WARN";
  return "SAFE";
}

// Read reply line like: "S,2\n"
int readStateFromESP32(unsigned long timeoutMs = 400) {
  unsigned long start = millis();

  char buf[24];
  uint8_t idx = 0;

  while (millis() - start < timeoutMs) {
    while (link.available()) {
      char c = (char)link.read();
      if (c == '\r') continue;

      if (c == '\n') {
        buf[idx] = '\0';

        if (idx > 0) {
          Serial.print("ESP32 reply: ");
          Serial.println(buf);
        }

        if (idx >= 3 && buf[0] == 'S' && buf[1] == ',') {
          int s = buf[2] - '0';
          if (s < 0) s = 0;
          if (s > 2) s = 2;
          return s;
        }

        idx = 0;
      } else {
        if (idx < sizeof(buf) - 1) buf[idx++] = c;
      }
    }
  }

  Serial.println("ESP32 reply: (none)");
  return -1;
}

// ---------- OLED UI helpers (16x8 cells) ----------

// Build a 16-char bar like: [####......]
void makeBar(char* out16, float flow) {
  // 16 columns total. We'll use 14 for bar + 2 brackets => "[............]"
  // length must fit 16 exactly including null terminator in buffer size 17.
  int filled = 0;

  // Map flow to 0..14 using DANGER as "full"
  float ratio = flow / DANGER_LMIN;
  if (ratio < 0) ratio = 0;
  if (ratio > 1) ratio = 1;

  filled = (int)(ratio * 14.0f + 0.5f);

  out16[0] = '[';
  for (int i = 0; i < 14; i++) out16[1 + i] = (i < filled) ? '#' : '.';
  out16[15] = ']';
  out16[16] = '\0';
}

// Format a short flow string for big display (max 5 chars)
void formatFlowBig(char* out, float flow) {
  // Prefer "12.3" (4 chars) or "0.0"
  // If too big, show "99+"
  if (flow >= 99.95f) {
    strcpy(out, "99+");
    return;
  }
  // One decimal keeps it short and readable in 2x2
  dtostrf(flow, 4, 1, out);   // width=4, 1 decimal => "12.3" or " 0.0"
  // Remove leading spaces for nicer centering
  while (out[0] == ' ') memmove(out, out + 1, strlen(out));
}

// Creative UI screen
void oledShow(float flowLmin, int state, bool espOk) {
  // Clear all 8 rows
  for (uint8_t y = 0; y < 8; y++) oled.clearLine(y);

  // Title (split to fit 16 cols)
  oled.drawString(0, 0, "FlashFlood");
  oled.drawString(0, 1, "Monitor");

  // Status badge on right side (fits)
  // Row 0 right area: "SAFE"/"WARN"/"DANGER"
  const char* st = stateToText(state);
  // Place status at col 10 (adjust if you want)
  if (state == 2) oled.drawString(10, 0, "DANGER");  // 6 chars
  else if (state == 1) oled.drawString(11, 0, "WARN"); // 4 chars
  else oled.drawString(12, 0, "SAFE"); // 4 chars

  // Big flow value (2x2)
  // Uses rows 2-3 and columns 0..?
  char fbig[8];
  formatFlowBig(fbig, flowLmin);

  oled.drawString(0, 2, "FLOW L/min");
  // big number starting around col 4 row 3 for good look
  oled.draw2x2String(4, 3, fbig);

  // Bar indicator (row 5)
  char bar[17];
  makeBar(bar, flowLmin);
  oled.drawString(0, 5, bar);

  // Bottom info row (row 7)
  // Example: "ESP:OK  W:5 D:15"
  char bottom[17];
  // Keep under 16 chars!
  // "ESP:OK W5 D15" = 12 chars
  snprintf(bottom, sizeof(bottom), "ESP:%s W5 D15", espOk ? "OK" : "FB");
  oled.drawString(0, 7, bottom);

  // Small hint row (row 6) based on state
  if (state == 2) oled.drawString(0, 6, "ALERT! TAKE ACTION");
  else if (state == 1) oled.drawString(0, 6, "Warning: High flow");
  else oled.drawString(0, 6, "Status: Normal");
}
// -----------------------------------------------

void setup() {
  Serial.begin(9600);
  link.begin(9600);

  pinMode(LED_G, OUTPUT);
  pinMode(LED_Y, OUTPUT);
  pinMode(LED_R, OUTPUT);
  pinMode(BUZZ, OUTPUT);

  pinMode(FLOW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), pulseISR, FALLING);

  oled.begin();
  oled.setPowerSave(0);
  oled.setFont(u8x8_font_chroma48medium8_r);

  // If your OLED is upside down, uncomment this:
  // oled.setFlipMode(1);

  oled.clearDisplay();
  oled.drawString(0, 0, "FlashFlood");
  oled.drawString(0, 1, "Monitor Booting");

  setOutputs(0);
  Serial.println("UNO core ready (Creative OLED + Serial).");
}

void loop() {
  // Measure pulses for 1 second
  noInterrupts();
  pulseCount = 0;
  interrupts();

  delay(1000);

  noInterrupts();
  unsigned long p = pulseCount;
  interrupts();

  // Flow in L/min
  float flowLmin = ((float)p) / CAL_FACTOR;

  // Send flow to ESP32
  link.print("F,");
  link.print(flowLmin, 2);
  link.print("\n");

  // Read state from ESP32
  int state = readStateFromESP32(400);
  bool espOk = true;

  if (state == -1) {
    espOk = false;
    state = fallbackState(flowLmin);
  }

  setOutputs(state);

  // Serial output (kept)
  Serial.print("Flow=");
  Serial.print(flowLmin, 2);
  Serial.print(" L/min  State=");
  Serial.print(state);
  Serial.print("  ESP=");
  Serial.println(espOk ? "OK" : "FALLBACK");

  // OLED UI
  oledShow(flowLmin, state, espOk);
}
