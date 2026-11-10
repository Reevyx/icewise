/*
  ICEWISE — Firmware del prototipo terrestre (ESP32)
  ---------------------------------------------------
  Demuestra el ciclo explorar → detectar → caracterizar → decidir → perforar → procesar → informar
  sobre un lecho de arena con zonas húmedas o congeladas (análogo, NO hielo lunar).

  Telemetría: una línea JSON por segundo por USB (115200 baudios), leída por el centro de
  control web mediante Web Serial (Chrome/Edge). Ejemplo:
  {"state":"EXPLORAR","bat":87,"v":7.42,"i":512,"t":21.4,"dist":38,"moist":12,"drill":0,"mass":0.0,"tilt":2.1}

  Hardware de referencia (ajustar pines a tu montaje):
    - Motores DC + TB6612FNG       PWMA 25, AIN1 26, AIN2 27, PWMB 14, BIN1 12, BIN2 13, STBY 33
    - Taladro: NEMA 17 + A4988 (avance)  STEP 18, DIR 19 ;  motor de giro vía MOSFET  32
    - Calefactor 12 V vía MOSFET    23 (con fusible térmico en serie)
    - HC-SR04                       TRIG 5, ECHO 17 (divisor 5V→3,3V en ECHO)
    - Humedad capacitiva v1.2       ADC 34
    - DS18B20                       4 (pull-up 4,7 kΩ)
    - HX711                         DOUT 16, SCK 15
    - INA219 y MPU-6050             I²C SDA 21, SCL 22
  Bibliotecas: OneWire, DallasTemperature, HX711 (bogde), Adafruit INA219, Adafruit MPU6050.
*/
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>
#include <Adafruit_INA219.h>
#include <Adafruit_MPU6050.h>

// ---------- Pines ----------
const int PWMA = 25, AIN1 = 26, AIN2 = 27, PWMB = 14, BIN1 = 12, BIN2 = 13, STBY = 33;
const int STEP_PIN = 18, DIR_PIN = 19, DRILL_SPIN = 32, HEATER = 23;
const int TRIG = 5, ECHO = 17, MOIST = 34, ONEWIRE = 4, HX_DOUT = 16, HX_SCK = 15;

// ---------- Reglas de decisión (mismas ideas que la simulación, escala de laboratorio) ----------
const int   MOIST_TRIGGER = 35;     // % humedad para considerar "señal"
const int   MOIST_GO = 45;          // % medio mínimo tras caracterizar
const float MOIST_MAX_SD = 8.0;     // incertidumbre máxima aceptada
const float TILT_MAX = 15.0;        // ° pendiente máxima
const int   BAT_MIN_GO = 40;        // % batería mínima para perforar
const int   DRILL_DEPTH_MM = 150;
const float STEPS_PER_MM = 400.0;   // husillo T8 (8 mm/vuelta) con 1/16 micropaso: 3200/8
const float HEAT_MAX_C = 80.0;      // corte de seguridad del calefactor
const float V_BAT_FULL = 8.4, V_BAT_EMPTY = 6.4; // batería 2S Li-ion

enum State { EXPLORAR, CARACTERIZAR, DECIDIR, PERFORAR, PROCESAR, INFORMAR, ESPERA };
const char* NAMES[] = { "EXPLORAR", "CARACTERIZAR", "DECIDIR", "PERFORAR", "PROCESAR", "INFORMAR", "ESPERA" };
State state = EXPLORAR;

OneWire ow(ONEWIRE);
DallasTemperature ds(&ow);
HX711 scale;
Adafruit_INA219 ina;
Adafruit_MPU6050 mpu;

float tempC = 0, tiltDeg = 0, massG = 0, voltage = 0, currentMA = 0, energyWh = 0;
int distCm = 0, moistPct = 0, drillMM = 0, batPct = 100;
float moistMean = 0, moistSd = 0, massBefore = 0, massAfter = 0;
unsigned long lastTelemetry = 0, lastEnergy = 0, stateStart = 0;
int samples[10]; int nSamples = 0;

// ---------- Utilidades ----------
void drive(int left, int right) {
  digitalWrite(AIN1, left > 0);  digitalWrite(AIN2, left < 0);  analogWrite(PWMA, abs(left));
  digitalWrite(BIN1, right > 0); digitalWrite(BIN2, right < 0); analogWrite(PWMB, abs(right));
}
int readDistance() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 25000);
  return us == 0 ? 400 : (int)(us / 58);
}
int readMoisture() {
  // Calibrar: valor en aire (seco) y en agua (100 %)
  const int DRY = 3000, WET = 1300;
  int raw = analogRead(MOIST);
  return constrain(map(raw, DRY, WET, 0, 100), 0, 100);
}
void readSensors() {
  distCm = readDistance();
  moistPct = readMoisture();
  ds.requestTemperatures(); tempC = ds.getTempCByIndex(0);
  if (scale.is_ready()) massG = scale.get_units(3);
  voltage = ina.getBusVoltage_V(); currentMA = ina.getCurrent_mA();
  batPct = constrain((int)((voltage - V_BAT_EMPTY) / (V_BAT_FULL - V_BAT_EMPTY) * 100), 0, 100);
  sensors_event_t a, g, t; mpu.getEvent(&a, &g, &t);
  tiltDeg = atan2(sqrt(a.acceleration.x * a.acceleration.x + a.acceleration.y * a.acceleration.y), a.acceleration.z) * 180.0 / PI;
  unsigned long now = millis();
  energyWh += voltage * currentMA / 1000.0 * (now - lastEnergy) / 3600000.0; // indicador: energía por operación
  lastEnergy = now;
}
void telemetry() {
  Serial.printf("{\"state\":\"%s\",\"bat\":%d,\"v\":%.2f,\"i\":%.0f,\"t\":%.1f,\"dist\":%d,\"moist\":%d,\"drill\":%d,\"mass\":%.1f,\"tilt\":%.1f,\"wh\":%.3f}\n",
    NAMES[state], batPct, voltage, currentMA, tempC, distCm, moistPct, drillMM, massG, tiltDeg, energyWh);
}
void enter(State s) { state = s; stateStart = millis(); drive(0, 0); }

void stepDrill(int mm, bool down) {
  digitalWrite(DIR_PIN, down ? HIGH : LOW);
  long steps = (long)(mm * STEPS_PER_MM);
  for (long k = 0; k < steps; k++) {
    digitalWrite(STEP_PIN, HIGH); delayMicroseconds(400);
    digitalWrite(STEP_PIN, LOW);  delayMicroseconds(400);
  }
}

// ---------- Programa ----------
void setup() {
  Serial.begin(115200);
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(PWMA, OUTPUT); pinMode(PWMB, OUTPUT); pinMode(STBY, OUTPUT); digitalWrite(STBY, HIGH);
  pinMode(STEP_PIN, OUTPUT); pinMode(DIR_PIN, OUTPUT); pinMode(DRILL_SPIN, OUTPUT); pinMode(HEATER, OUTPUT);
  digitalWrite(HEATER, LOW); digitalWrite(DRILL_SPIN, LOW);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  Wire.begin(21, 22);
  ds.begin();
  scale.begin(HX_DOUT, HX_SCK); scale.set_scale(420.0f); scale.tare(); // calibrar con masa patrón
  ina.begin();
  mpu.begin();
  lastEnergy = millis();
  enter(EXPLORAR);
}

void loop() {
  readSensors();

  // Seguridad del calefactor en cualquier estado
  if (tempC > HEAT_MAX_C) digitalWrite(HEATER, LOW);

  switch (state) {
    case EXPLORAR:
      if (distCm < 20) { drive(-150, 150); delay(350); }      // evitar obstáculo girando
      else drive(160, 160);
      if (moistPct >= MOIST_TRIGGER) { nSamples = 0; enter(CARACTERIZAR); }
      break;

    case CARACTERIZAR:                                        // 10 lecturas para media y desviación
      if (nSamples < 10) { samples[nSamples++] = moistPct; delay(200); }
      else {
        float s = 0, s2 = 0;
        for (int k = 0; k < 10; k++) { s += samples[k]; s2 += samples[k] * samples[k]; }
        moistMean = s / 10.0; moistSd = sqrt(max(0.0f, s2 / 10.0f - moistMean * moistMean));
        enter(DECIDIR);
      }
      break;

    case DECIDIR: {
      bool go = moistMean >= MOIST_GO && moistSd <= MOIST_MAX_SD && tiltDeg <= TILT_MAX && batPct >= BAT_MIN_GO;
      Serial.printf("{\"decision\":\"%s\",\"moistMean\":%.1f,\"moistSd\":%.1f,\"tilt\":%.1f,\"bat\":%d}\n",
                    go ? "GO" : "NO-GO", moistMean, moistSd, tiltDeg, batPct);
      if (go) { massBefore = massG; energyWh = 0; enter(PERFORAR); }
      else { drive(160, 160); delay(1500); enter(EXPLORAR); }  // salir de la zona y seguir explorando
      break;
    }

    case PERFORAR:                                            // mordidas de 10 mm
      digitalWrite(DRILL_SPIN, HIGH);
      if (drillMM < DRILL_DEPTH_MM) { stepDrill(10, true); drillMM += 10; }
      else {
        stepDrill(DRILL_DEPTH_MM, false); drillMM = 0; digitalWrite(DRILL_SPIN, LOW);
        delay(1000); massBefore = massG;                      // masa de muestra húmeda en el recipiente
        enter(PROCESAR);
      }
      break;

    case PROCESAR:                                            // calentar y condensar; máx. 10 min
      digitalWrite(HEATER, tempC < 70.0 ? HIGH : LOW);
      if (millis() - stateStart > 600000UL) { digitalWrite(HEATER, LOW); massAfter = massG; enter(INFORMAR); }
      break;

    case INFORMAR: {
      float lostWater = massBefore - massAfter;               // agua evaporada de la muestra (g)
      Serial.printf("{\"report\":true,\"sample_g\":%.1f,\"water_out_g\":%.1f,\"energy_wh\":%.3f}\n", massBefore, lostWater, energyWh);
      // La masa condensada se pesa por separado para calcular la eficiencia = condensada / evaporada.
      enter(ESPERA);
      break;
    }

    case ESPERA:
      if (millis() - stateStart > 10000UL) enter(EXPLORAR);
      break;
  }

  if (millis() - lastTelemetry >= 1000) { lastTelemetry = millis(); telemetry(); }
  delay(20);
}
