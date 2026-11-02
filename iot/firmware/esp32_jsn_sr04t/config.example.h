// Copiez ce fichier en config.h et renseignez vos valeurs. NE JAMAIS publier config.h (il contient des secrets).
#pragma once
#define WIFI_SSID        "votre-wifi"
#define WIFI_PASSWORD    "votre-mot-de-passe"
#define API_URL          "https://api.exemple.ci/api/v1/sensors/CI-ABJ-001/readings"  // le code doit exister dans IntelliFlood
#define API_KEY          "clé-appareil (INGEST_API_KEY)"
#define MOUNT_HEIGHT_CM  150     // hauteur de fixation du capteur au-dessus du fond du canal (cm)
#define PIN_TRIG         26
#define PIN_ECHO         27      // ATTENTION : l'écho du JSN-SR04T est en 5 V → diviseur de tension (ex. 1 kΩ + 2 kΩ) vers 3,3 V
#define PIN_SIREN        25      // relais sirène / gyrophare (autonomie locale)
#define LOCAL_ALERT_CM   80      // seuil local (secours si le serveur est injoignable) — à valider
#define SAMPLES          7       // rafale de relevés (médiane côté serveur)
#define CYCLE_SECONDS    60
