/*
 * IntelliFlood — capteur de niveau d'eau : ESP32 + JSN-SR04T (ultrasons étanche).
 * ÉTAT : code de référence NON COMPILÉ NI TESTÉ sur matériel dans cet environnement. À valider sur banc d'essai.
 *
 * Cycle : rafale de SAMPLES mesures (~3 s) → envoi HTTPS au serveur (clé d'appareil) → veille.
 * Hors ligne : mesures conservées en mémoire (tampon circulaire) et renvoyées au retour du réseau ;
 * si le niveau dépasse LOCAL_ALERT_CM 3 cycles de suite, la sirène locale est déclenchée même sans serveur.
 * Pour une liaison GSM (2G/4G) à la place du Wi-Fi : bibliothèque TinyGSM (SIM800/SIM7600) — même requête HTTPS.
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "config.h"

struct Burst { float cm[SAMPLES]; uint32_t epoch; };
static Burst buffer[20];            // ~20 cycles hors ligne
static int pending = 0;
static int overCount = 0;

float measureOnceCm() {
  digitalWrite(PIN_TRIG, LOW); delayMicroseconds(4);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(12);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, 30000);   // 30 ms ≈ 5 m
  return us == 0 ? NAN : us * 0.0343f / 2.0f;           // vitesse du son ≈ 343 m/s à 20 °C
}

bool sendBurst(const Burst &b) {
  WiFiClientSecure tls; tls.setInsecure();   // TODO production : tls.setCACert(<certificat racine du serveur>)
  HTTPClient http; http.begin(tls, API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  String body = "{\"samples_cm\":[";
  bool first = true;
  for (int i = 0; i < SAMPLES; i++) if (!isnan(b.cm[i])) { body += (first ? "" : ","); body += String(b.cm[i], 1); first = false; }
  body += "]}";
  int code = http.POST(body); http.end();
  return code == 201;
}

void setup() {
  pinMode(PIN_TRIG, OUTPUT); pinMode(PIN_ECHO, INPUT); pinMode(PIN_SIREN, OUTPUT);
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop() {
  Burst b = {};
  float sorted[SAMPLES]; int n = 0;
  for (int i = 0; i < SAMPLES; i++) { b.cm[i] = measureOnceCm(); if (!isnan(b.cm[i])) sorted[n++] = b.cm[i]; delay(400); }
  if (n > 0) {   // médiane locale pour la décision de secours
    for (int i = 1; i < n; i++) for (int j = i; j > 0 && sorted[j-1] > sorted[j]; j--) { float t = sorted[j]; sorted[j] = sorted[j-1]; sorted[j-1] = t; }
    float level = MOUNT_HEIGHT_CM - sorted[n / 2];
    overCount = (level >= LOCAL_ALERT_CM) ? overCount + 1 : 0;
    digitalWrite(PIN_SIREN, overCount >= 3 ? HIGH : LOW);
  }
  if (pending < 20) buffer[pending++] = b;
  if (WiFi.status() == WL_CONNECTED) {
    while (pending > 0 && sendBurst(buffer[0])) { for (int i = 1; i < pending; i++) buffer[i-1] = buffer[i]; pending--; }
  } else { WiFi.reconnect(); }
  delay(CYCLE_SECONDS * 1000UL);
}
