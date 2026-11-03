# Données météo (M3)

IntelliFlood n'est pas limité aux capteurs : la pluie est une source de données à part entière.

| Source | Mode | Statut |
|---|---|---|
| **Open-Meteo** | Automatique (toutes les 30 min par défaut, `WEATHER_ENABLED=true`) sur un maillage national d'environ 50 km, plus les 7 villes configurées et les capteurs actifs | Collecte activée par défaut. Les coordonnées sont regroupées par lots de 100; environ 96 requêtes/jour pour le maillage seul au rythme actuel, plus les lots nécessaires aux villes/capteurs. Gratuit sans clé pour un usage **non commercial** (~10 000 requêtes/jour) ; un usage commercial exige une licence ou un serveur auto-hébergé. Données CC BY 4.0 (attribution affichée). La précipitation courante et les heures passées/prévues sont des estimations de modèle, pas des mesures de pluviomètres. |
| **OpenWeather** | Conditions actuelles via `WEATHER_OPENWEATHER_API_KEY` (clé exclusivement côté serveur) | Connecteur disponible et facultatif; aucune clé n'est incluse. Conditions d'accès, quota et couverture du compte doivent être vérifiés avant activation. |
| **SODEXAM / ONPC / autres bulletins** | Saisie via `POST /api/v1/weather/observations` par un opérateur | Conservé. La source et l'heure valide restent associées au bulletin; aucune API publique n'est présumée. |
| **Pluviomètres IoT** | `POST /api/v1/sensors/{code}/rainfall` avec clé d'appareil ou compte opérateur | Voie distincte des capteurs de niveau d'eau; cumuls horaires et horodatages sont stockés avec la provenance `iot-rain-gauge`. |

**Risque pluie** (par point) = max(intensité des 3 prochaines heures, cumul des 24 dernières heures) comparé à des seuils **provisoires** (10 / 30 mm/h, 50 / 100 mm sur 24 h) configurables (`RAIN_*`) — à valider avec la SODEXAM ou un hydrologue.
Une collecte en échec (réseau, quota) n'interrompt ni l'API ni les autres points ; les anciennes valeurs restent affichées et leur fraîcheur est visible via `GET /api/v1/weather/status`. Les observations de terrain, les estimations courantes Open-Meteo et les prévisions sont affichées séparément. Une heure passée Open-Meteo n'est jamais présentée comme une mesure de terrain.

Un pluviomètre s'enregistre comme capteur `rain_gauge`, puis transmet un cumul
horaire en millimètres avec `POST /api/v1/sensors/{code}/rainfall`. L'ingestion
accepte la clé configurée dans `INGEST_API_KEY` (en-tête `X-API-Key`) ou le
jeton d'un agent terrain/opérateur. Exemple de corps :

```json
{
  "precip_mm": 12.5,
  "measured_at": "2026-10-31T12:00:00Z"
}
```

Cette route est distincte de l'envoi des mesures de niveau d'eau. Les seuils de
déclenchement automatique sont provisoires et sont à confirmer pour chaque
déploiement.

**Vérifié** : analyse des formats, enregistrement idempotent, tolérance aux pannes, saisie de bulletins et tests de l'ingestion des pluviomètres (tests sur PostGIS). Les connecteurs réseau sont testés avec des réponses simulées.
**À vérifier au déploiement** : connectivité sortante, abonnement/quota OpenWeather, licence Open-Meteo et fraîcheur réelle des sources.

## Affichage automatique et limites scientifiques

La visualisation de pluie affiche les précipitations courantes rapportées par
OpenWeather, les bulletins et les pluviomètres, ainsi que l'estimation courante
du modèle Open-Meteo, avec une provenance distincte. Une pluie positive peut
ainsi apparaître sur la carte sans être présentée comme une mesure de terrain.
Les prévisions restent séparées. La simulation MNT automatique est calculée
pour les points où des mesures récentes ou une estimation courante dépassent
les seuils provisoires; une pluie légère peut être visualisée sans qu'une
emprise d'inondation soit simulée. Aucune de ces emprises ne confirme une
inondation réelle.

La couleur de la situation globale n'utilise que des mesures récentes de
capteurs de niveau actifs et des observations de pluie non prévisionnelles.
Les prévisions et les estimations de modèle Open-Meteo ne peuvent pas rendre
la situation globale orange ou rouge. Sans mesure actuelle disponible, l'état
est « Données insuffisantes », et non « Vert ». Même avec des mesures, cette
synthèse ne vaut que pour les points effectivement suivis; elle ne prouve pas
l'absence de risque dans les zones non couvertes.

La collecte Open-Meteo couvre désormais la Côte d'Ivoire avec un maillage
d'environ 50 km, filtré par la frontière nationale Natural Earth, puis fusionné
avec les sept villes configurées et les emplacements des capteurs non démo.
Cette maille donne une estimation régionale, pas une précision de crue locale;
les points ajoutés ne sont ni des pluviomètres ni des observations terrain.
OpenWeather reste limité aux villes et capteurs, afin de ne pas multiplier les
requêtes d'un compte utilisateur sur toute la maille. La collecte reste
périodique (30 minutes par défaut), pas un flux temps réel garanti.
La frontière est issue de Natural Earth 10m, jeu `ne_10m_admin_0_countries`,
commit [`ca96624`](https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19),
licence domaine public; le statut météo expose l'espacement et le nombre de
points du maillage.
Open-Meteo est retenu pour l'instant dans un contexte non commercial; sa licence
doit être réévaluée avant tout usage commercial.

Les capteurs dont le code commence par `DEMO-` (notamment Caniveau A, B et C)
et leurs alertes sont exclus des listes, cartes, statistiques et simulations
automatiques. Les enregistrements historiques restent conservés dans la base;
aucune donnée n'est supprimée.

Les seuils de pluie et le modèle MNT restent provisoires et ne constituent pas
un modèle hydrodynamique validé. Toute emprise calculée à partir de pluie doit
être présentée comme une estimation illustrative, liée à ses sources,
horodatages et hypothèses; elle ne doit pas être décrite comme une observation
d'inondation. Les simulations créées manuellement restent disponibles et
distinctes des données météo automatiques.

Open-Meteo est collecté sans clé. OpenWeather est facultatif jusqu'à
l'obtention d'une clé. Pour l'activer, définir
`WEATHER_OPENWEATHER_API_KEY` dans `apps/api/.env` puis redémarrer l'API. Ne
jamais placer cette clé dans le frontend, un dépôt Git ou les journaux.
L'endpoint courant OpenWeather fournit une pluie cumulée sur une heure lorsqu'elle
est rapportée; une absence de champ pluie est interprétée comme zéro par ce
fournisseur.
