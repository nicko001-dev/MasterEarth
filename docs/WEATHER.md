# Données météo (M3)

IntelliFlood n'est pas limité aux capteurs : la pluie est une source de données à part entière.

| Source | Mode | Statut |
|---|---|---|
| **Open-Meteo** | Automatique (toutes les 30 min, `WEATHER_ENABLED=true`) pour 7 villes + chaque capteur | Implémenté. Gratuit sans clé pour un usage **non commercial** (~10 000 requêtes/jour) ; un usage commercial exige une licence ou un serveur auto-hébergé. Données CC BY 4.0 (attribution affichée). |
| **SODEXAM / ONPC / autres bulletins** | Saisie via `POST /api/v1/weather/observations` (clé d'API) | Implémenté. Aucune API publique SODEXAM trouvée : d'après une présentation GWP (2023), ses données d'alerte sont diffusées sous forme de bulletins et non en brut → accord de partenariat à obtenir. |
| Stations météo locales / pluviomètres IoT | Même endpoint, ou capteurs M2.2 | Extensible |

**Risque pluie** (par point) = max(intensité des 3 prochaines heures, cumul des 24 dernières heures) comparé à des seuils **provisoires** (10 / 30 mm/h, 50 / 100 mm sur 24 h) configurables (`RAIN_*`) — à valider avec la SODEXAM ou un hydrologue.
Une collecte en échec (réseau, quota) n'interrompt ni l'API ni les autres points ; les anciennes valeurs restent affichées.

**Vérifié** : analyse du format, enregistrement idempotent, tolérance aux pannes et saisie de bulletins (tests sur PostGIS).
**Non vérifié** : l'appel réel à Open-Meteo (réseau sortant bloqué dans l'environnement de développement) → lancer `python scripts/check_weather.py` chez toi.
