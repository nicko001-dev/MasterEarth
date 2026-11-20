"""Modèle indicatif multi-aléas (couche domaine, sans dépendance framework).

Les simulations MasterEarth répondent à une question « et si ? ». Elles ne
remplacent ni une observation, ni une prévision officielle, ni une alerte. Tous
les résultats sont donc explicitement marqués comme des **estimations
indicatives** et chaque métrique porte sa base de calcul.

Le modèle est volontairement déterministe : mêmes entrées, mêmes sorties. Il
reprend des relations empiriques publiées et des ordres de grandeur usuels,
sans prétendre à la précision d'un modèle physique calibré. Les limites sont
explicites dans ``LIMITATIONS`` et dans la réponse.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

MODEL_VERSION = "masterearth-indicative-v1"
DISCLAIMER = (
    "Simulation indicative MasterEarth. Ce n'est ni une prévision officielle, "
    "ni une alerte : suivez toujours les consignes des autorités."
)

HAZARD_LABELS = {
    "earthquake": "Séisme",
    "tsunami": "Tsunami",
    "volcano": "Éruption volcanique",
    "hurricane": "Cyclone tropical",
    "flood": "Inondation",
    "wildfire": "Feu de forêt",
    "drought": "Sécheresse",
    "landslide": "Glissement de terrain",
    "sandstorm": "Tempête de sable",
    "blizzard": "Blizzard",
    "heatwave": "Canicule",
    "tornado": "Tornade",
    "storm": "Orage violent",
}

SEVERITY_LABELS = {
    "low": "Faible",
    "moderate": "Modérée",
    "high": "Élevée",
    "extreme": "Extrême",
}

LIMITATIONS = (
    "Modèle empirique simplifié, non calibré sur un bassin ou un bâtiment précis.",
    "Les valeurs de population, de bâti et d'infrastructures ne sont pas calculées ici : elles doivent venir de jeux de données réels.",
    "L'incertitude augmente fortement avec la distance, le relief et la qualité des données d'entrée.",
    "Une simulation ne remplace jamais un bulletin officiel ni une consigne d'évacuation.",
)

ASSUMPTIONS = (
    "Terrain homogène autour du point étudié, sans effets de site détaillés.",
    "Relations empiriques d'ordre de grandeur, arrondies pour la lisibilité.",
    "Aucune donnée d'occupation du sol ni de vulnérabilité n'est inventée.",
)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _number(inputs: dict[str, Any], key: str, default: float) -> float:
    value = inputs.get(key, default)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _severity_from_index(index: float) -> str:
    if index >= 75:
        return "extreme"
    if index >= 50:
        return "high"
    if index >= 25:
        return "moderate"
    return "low"


def _metric(key: str, label: str, value: float | int | str, unit: str, basis: str) -> dict[str, Any]:
    if isinstance(value, float):
        value = round(value, 3) if abs(value) < 1 else round(value, 1)
    return {"key": key, "label": label, "value": value, "unit": unit, "basis": basis}


def _timeline(peak: float, hours: float, *, decay: str = "smooth", points: int = 9) -> list[dict[str, Any]]:
    """Courbe indicative normalisée, sans prétendre à une chronologie physique."""
    total = max(0.25, hours)
    rows: list[dict[str, Any]] = []
    for index in range(points):
        fraction = index / max(1, points - 1)
        hour = total * fraction
        if decay == "rise":
            progress = _clamp(fraction / 0.7, 0, 1)
            value = peak * (3 * progress**2 - 2 * progress**3)
        elif decay == "decay":
            value = peak * math.exp(-3.2 * fraction)
        elif decay == "pulse":
            value = peak * math.exp(-((fraction - 0.25) ** 2) / 0.045)
        else:
            value = peak * (0.35 + 0.65 * math.sin(math.pi * fraction) ** 0.8)
        rows.append({
            "fraction": round(fraction, 3),
            "hour": round(hour, 2),
            "intensity_index": round(_clamp(value, 0, 100), 1),
            "label": SEVERITY_LABELS[_severity_from_index(value)],
        })
    return rows


def _result(
    hazard: str,
    inputs: dict[str, Any],
    *,
    lat: float,
    lon: float,
    center_name: str | None,
    radius_km: float,
    index: float,
    metrics: list[dict[str, Any]],
    timeline: list[dict[str, Any]],
    statements: list[str],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    severity = _severity_from_index(index)
    return {
        "hazard": hazard,
        "label": HAZARD_LABELS[hazard],
        "model": MODEL_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "center": {"lat": round(lat, 5), "lon": round(lon, 5), "name": center_name},
        "radius_km": round(radius_km, 2),
        "intensity_index": round(_clamp(index, 0, 100), 1),
        "severity": severity,
        "severity_label": SEVERITY_LABELS[severity],
        "metrics": metrics,
        "timeline": timeline,
        "statements": statements,
        "input": dict(inputs),
        "assumptions": list(ASSUMPTIONS),
        "limitations": list(LIMITATIONS),
        "disclaimer": DISCLAIMER,
        **(extra or {}),
    }


def simulate_earthquake(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    magnitude = _clamp(_number(inputs, "magnitude", 6.5), 2.0, 9.8)
    depth = _clamp(_number(inputs, "depth_km", 15.0), 0.5, 700.0)
    # Relations d'ordre de grandeur inspirées de Wells & Coppersmith (1994)
    # et de la décroissance macrosismique usuelle. Elles restent indicatives.
    rupture_length_km = 10 ** (0.59 * magnitude - 2.44)
    felt_radius_km = 10 ** (0.5 * magnitude - 0.8) * (1 + depth / 120)
    damage_radius_km = 10 ** (0.5 * magnitude - 1.6) * (1 + depth / 200)
    mmi = _clamp(1.5 * magnitude - 1.2 * math.log10(depth + 10) - 0.6, 1, 12)
    energy_j = 10 ** (1.5 * magnitude + 4.8)
    index = _clamp((magnitude - 2.5) / 6.5 * 100, 0, 100)
    area_km2 = math.pi * felt_radius_km**2
    metrics = [
        _metric("magnitude", "Magnitude", magnitude, "Mw", "Entrée utilisateur"),
        _metric("profondeur_km", "Profondeur", depth, "km", "Entrée utilisateur"),
        _metric("intensite_mmi", "Intensité macrosismique estimée", mmi, "MMI", "Relation empirique magnitude–profondeur"),
        _metric("rayon_ressenti_km", "Rayon ressenti estimé", felt_radius_km, "km", "Décroissance macrosismique indicative"),
        _metric("rayon_dommages_km", "Rayon de dommages potentiels", damage_radius_km, "km", "Décroissance macrosismique indicative"),
        _metric("longueur_rupture_km", "Longueur de rupture estimée", rupture_length_km, "km", "Wells & Coppersmith (1994), ordre de grandeur"),
        _metric("energie_j", "Énergie sismique estimée", energy_j, "J", "Relation énergie–magnitude (Gutenberg–Richter)"),
        _metric("surface_estimee_km2", "Surface ressentie estimée", area_km2, "km²", "Aire du rayon ressenti"),
    ]
    return _result(
        "earthquake", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(damage_radius_km, 5), index=index, metrics=metrics,
        timeline=_timeline(index, 72, decay="decay"),
        statements=[
            f"Un séisme de magnitude {magnitude:.1f} à {depth:.0f} km de profondeur est estimé ressenti dans un rayon d'environ {felt_radius_km:.0f} km.",
            f"Les dommages les plus probables se concentrent dans un rayon indicatif de {damage_radius_km:.0f} km ; l'intensité maximale estimée atteint MMI {mmi:.1f}.",
            "Les répliques sont probables dans les heures et jours suivants ; leur nombre réel ne peut pas être prédit.",
        ],
    )


def simulate_tsunami(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    magnitude = _clamp(_number(inputs, "magnitude", 8.0), 4.0, 9.8)
    depth_m = _clamp(_number(inputs, "ocean_depth_m", 4000.0), 100.0, 8000.0)
    distance_km = _clamp(_number(inputs, "distance_coast_km", 500.0), 1.0, 8000.0)
    speed_kmh = math.sqrt(9.81 * depth_m) * 3.6
    amplitude_m = _clamp(10 ** (magnitude - 8.3), 0.02, 15.0)
    runup_m = amplitude_m * 3.0
    arrival_min = distance_km / max(1.0, speed_kmh) * 60
    inundation_m = runup_m * 120
    index = _clamp((magnitude - 6.5) / 3.0 * 80 + amplitude_m * 8, 0, 100)
    metrics = [
        _metric("magnitude", "Magnitude du séisme source", magnitude, "Mw", "Entrée utilisateur"),
        _metric("vitesse_kmh", "Vitesse de propagation en pleine mer", speed_kmh, "km/h", "Onde longue : √(g × profondeur)"),
        _metric("amplitude_m", "Amplitude en pleine mer", amplitude_m, "m", "Relation empirique magnitude–amplitude"),
        _metric("runup_m", "Run-up indicatif sur la côte", runup_m, "m", "Amplification côtière ×3"),
        _metric("arrivee_min", "Temps d'arrivée estimé", arrival_min, "min", "Distance ÷ vitesse de l'onde"),
        _metric("inondation_m", "Extension terrestre indicative", inundation_m, "m", "Run-up × 120 (très simplifié)"),
        _metric("distance_cote_km", "Distance à la côte", distance_km, "km", "Entrée utilisateur"),
        _metric("profondeur_ocean_m", "Profondeur océanique", depth_m, "m", "Entrée utilisateur"),
    ]
    return _result(
        "tsunami", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(20, inundation_m / 1000 * 4), index=index, metrics=metrics,
        timeline=_timeline(index, max(0.5, arrival_min / 60 + 3), decay="pulse"),
        statements=[
            f"L'onde parcourt environ {speed_kmh:.0f} km/h en eau profonde et atteindrait la côte en ~{arrival_min:.0f} minutes.",
            f"Le run-up indicatif est de {runup_m:.1f} m ; en zone côtière basse, l'eau pourrait pénétrer de plusieurs centaines de mètres.",
            "Les autorités locales peuvent ordonner une évacuation avant l'arrivée estimée : cette simulation ne remplace pas leur décision.",
        ],
    )


def simulate_volcano(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    vei = _clamp(_number(inputs, "vei", 3.0), 0, 7)
    wind = _clamp(_number(inputs, "wind_kmh", 30.0), 0, 250)
    duration = _clamp(_number(inputs, "duration_h", 6.0), 0.5, 96)
    plume_km = _clamp(1.2 * vei + 0.8, 0.3, 20)
    ash_area_km2 = max(50.0, wind * duration * math.sqrt(max(1.0, plume_km)) * 18)
    exclusion_km = 3 + 2 * vei
    lava_km = max(0.3, vei * 1.2)
    index = _clamp(vei / 7 * 100, 0, 100)
    metrics = [
        _metric("vei", "Indice d'explosivité volcanique", vei, "VEI", "Entrée utilisateur"),
        _metric("panache_km", "Hauteur du panache", plume_km, "km", "Relation indicative VEI–panache"),
        _metric("surface_cendres_km2", "Zone de retombées de cendres", ash_area_km2, "km²", "Vent × durée × largeur de panache"),
        _metric("rayon_exclusion_km", "Rayon d'exclusion indicatif", exclusion_km, "km", "3 + 2 × VEI"),
        _metric("longueur_lave_km", "Longueur de coulée estimée", lava_km, "km", "Ordre de grandeur VEI"),
        _metric("vent_kmh", "Vent en altitude", wind, "km/h", "Entrée utilisateur"),
        _metric("duree_h", "Durée de l'éruption", duration, "h", "Entrée utilisateur"),
    ]
    return _result(
        "volcano", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=exclusion_km, index=index, metrics=metrics,
        timeline=_timeline(index, max(1, duration * 2), decay="pulse"),
        statements=[
            f"Le panache est estimé à {plume_km:.1f} km ; les cendres peuvent perturber le trafic aérien sur des centaines de kilomètres.",
            f"Les coulées et projections justifient un rayon d'exclusion indicatif de {exclusion_km:.0f} km.",
            "La direction réelle du panache dépend du vent local et de la dynamique de l'éruption.",
        ],
    )


def simulate_hurricane(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    wind = _clamp(_number(inputs, "wind_kmh", 180.0), 40, 380)
    pressure = _clamp(_number(inputs, "pressure_hpa", 960.0), 850, 1020)
    rain = _clamp(_number(inputs, "rain_mm_h", 25.0), 0, 200)
    duration = _clamp(_number(inputs, "duration_h", 12.0), 1, 96)
    if wind >= 252:
        category = 5
    elif wind >= 209:
        category = 4
    elif wind >= 178:
        category = 3
    elif wind >= 154:
        category = 2
    elif wind >= 119:
        category = 1
    else:
        category = 0
    hurricane_radius_km = 25 + 0.35 * max(0, wind - 119)
    surge_m = max(0.2, 0.04 * (wind - 60))
    total_rain_mm = rain * duration
    affected_km2 = math.pi * (3 * hurricane_radius_km) ** 2
    # L'indice combine l'échelle Saffir-Simpson et la vitesse : un ouragan de
    # catégorie 5 reste « extrême », une tempête tropicale reste modérée.
    index = _clamp(20 + (wind - 60) / 250 * 80, 0, 100)
    metrics = [
        _metric("wind_kmh", "Vents maximaux", wind, "km/h", "Entrée utilisateur"),
        _metric("category", "Catégorie Saffir-Simpson", category, "", "Échelle de vents soutenus"),
        _metric("pressure_hpa", "Pression centrale", pressure, "hPa", "Entrée utilisateur"),
        _metric("surge_m", "Surcote côtière indicative", surge_m, "m", "Relation simplifiée vent–surcote"),
        _metric("pluie_totale_mm", "Pluie cumulée", total_rain_mm, "mm", "Pluie horaire × durée"),
        _metric("rayon_vent_fort_km", "Rayon de vent cyclonique", hurricane_radius_km, "km", "Relation empirique vent–rayon"),
        _metric("surface_affectee_km2", "Surface affectée estimée", affected_km2, "km²", "Aire du rayon de vent fort ×3"),
    ]
    return _result(
        "hurricane", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(50, hurricane_radius_km * 3), index=index, metrics=metrics,
        timeline=_timeline(index, duration, decay="smooth"),
        statements=[
            f"Cyclone de catégorie {category} ({wind:.0f} km/h) : la surcote côtière peut atteindre ~{surge_m:.1f} m.",
            f"Les pluies cumulées pourraient approcher {total_rain_mm:.0f} mm, avec un risque d'inondation et de glissement.",
            "La trajectoire réelle et l'intensité sont réévaluées en continu par les centres météorologiques.",
        ],
    )


def simulate_flood(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    rain = _clamp(_number(inputs, "rain_mm_h", 30.0), 0, 300)
    duration = _clamp(_number(inputs, "duration_h", 6.0), 0.5, 96)
    radius_km = _clamp(_number(inputs, "radius_km", 20.0), 0.5, 200)
    runoff = _clamp(_number(inputs, "runoff", 0.6), 0, 1)
    area_km2 = math.pi * radius_km**2
    discharge_m3s = runoff * rain * area_km2 / 3.6
    volume_m3 = discharge_m3s * duration * 3600
    depth_m = volume_m3 / (area_km2 * 1_000_000) if area_km2 else 0
    index = _clamp(rain / 100 * 60 + duration / 24 * 40, 0, 100)
    metrics = [
        _metric("rain_mm_h", "Intensité de pluie", rain, "mm/h", "Entrée utilisateur"),
        _metric("duree_h", "Durée", duration, "h", "Entrée utilisateur"),
        _metric("coefficient_ruissellement", "Coefficient de ruissellement", runoff, "", "Entrée utilisateur"),
        _metric("debit_m3s", "Débit de pointe estimé", discharge_m3s, "m³/s", "Méthode rationnelle simplifiée"),
        _metric("volume_m3", "Volume ruisselé", volume_m3, "m³", "Débit × durée"),
        _metric("profondeur_moyenne_m", "Profondeur moyenne sur le bassin", depth_m, "m", "Volume ÷ surface"),
        _metric("surface_bassin_km2", "Surface du bassin", area_km2, "km²", "π × rayon²"),
    ]
    return _result(
        "flood", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=radius_km, index=index, metrics=metrics,
        timeline=_timeline(index, duration * 1.5, decay="rise"),
        statements=[
            f"Le débit de pointe indicatif atteint {discharge_m3s:.0f} m³/s sur un bassin de {area_km2:.0f} km².",
            f"La lame d'eau moyenne serait d'environ {depth_m * 100:.0f} cm ; les points bas et les réseaux saturés peuvent être bien plus profonds.",
            "Le modèle ne tient pas compte du relief fin, du drainage ni de l'occupation du sol.",
        ],
    )


def simulate_wildfire(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    wind = _clamp(_number(inputs, "wind_kmh", 30.0), 0, 150)
    duration = _clamp(_number(inputs, "duration_h", 12.0), 0.5, 120)
    slope = _clamp(_number(inputs, "slope_deg", 10.0), 0, 60)
    spread_m_min = _clamp(0.3 + 0.12 * wind + 0.08 * slope, 0.1, 60)
    head_km = spread_m_min * duration * 60 / 1000
    width_km = max(0.1, head_km * 0.4)
    area_km2 = math.pi * head_km * width_km / 4
    index = _clamp(area_km2 / 50 * 70 + wind / 100 * 30, 0, 100)
    metrics = [
        _metric("vitesse_propagation_m_min", "Vitesse de propagation", spread_m_min, "m/min", "Vent + pente + combustible (simplifié)"),
        _metric("front_km", "Longueur du front", head_km, "km", "Vitesse × durée"),
        _metric("largeur_km", "Largeur estimée", width_km, "km", "40 % de la progression"),
        _metric("surface_km2", "Surface brûlée estimée", area_km2, "km²", "Aire elliptique simplifiée"),
        _metric("vent_kmh", "Vent", wind, "km/h", "Entrée utilisateur"),
        _metric("pente_deg", "Pente", slope, "°", "Entrée utilisateur"),
    ]
    return _result(
        "wildfire", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(1, head_km), index=index, metrics=metrics,
        timeline=_timeline(index, duration, decay="rise"),
        statements=[
            f"Le front pourrait progresser d'environ {head_km:.1f} km en {duration:.0f} h, sur une surface de ~{area_km2:.1f} km².",
            "Les sautes de feu, les projections de braises et les changements de vent peuvent dépasser largement cette enveloppe.",
        ],
    )


def simulate_drought(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    rain = _clamp(_number(inputs, "rain_mm", 120.0), 0, 5000)
    normal = _clamp(_number(inputs, "normal_mm", 400.0), 1, 5000)
    days = _clamp(_number(inputs, "duration_h", 90.0), 1, 730)
    deficit_pct = _clamp((normal - rain) / normal * 100, -100, 100)
    index = _clamp(deficit_pct * 1.4, 0, 100)
    metrics = [
        _metric("pluie_mm", "Pluie observée", rain, "mm", "Entrée utilisateur"),
        _metric("normale_mm", "Normale de référence", normal, "mm", "Entrée utilisateur"),
        _metric("deficit_pct", "Déficit hydrique", deficit_pct, "%", "(Normale − pluie) ÷ normale"),
        _metric("duree_jours", "Durée", days, "jours", "Entrée utilisateur"),
    ]
    return _result(
        "drought", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(5, math.sqrt(max(1, days)) * 3), index=index, metrics=metrics,
        timeline=_timeline(index, days, decay="rise"),
        statements=[
            f"Le déficit pluviométrique atteint {deficit_pct:.0f} % par rapport à la normale, sur {days:.0f} jours.",
            "Ce diagnostic simplifié ne remplace pas un indice de sécheresse officiel (SPI, SPEI, bilan hydrique des sols).",
        ],
    )


def simulate_landslide(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    slope = _clamp(_number(inputs, "slope_deg", 28.0), 0, 75)
    rain = _clamp(_number(inputs, "rain_mm_h", 25.0), 0, 250)
    moisture = _clamp(_number(inputs, "soil_moisture", 0.6), 0, 1)
    height = _clamp(_number(inputs, "height_m", 120.0), 1, 3000)
    beta = math.radians(slope)
    cohesion = 10_000  # Pa, sol cohérent générique
    gamma = 18_000  # N/m³
    phi = math.radians(30)
    thickness = 2.0
    pore_pressure_ratio = _clamp(0.15 + moisture * 0.4 + rain / 500, 0, 0.85)
    if slope < 1:
        factor = 9.9
    else:
        driving = gamma * thickness * math.sin(beta) * math.cos(beta)
        resisting = cohesion + (gamma * thickness * math.cos(beta) ** 2 - pore_pressure_ratio * 9_810 * thickness) * math.tan(phi)
        factor = resisting / max(1, driving)
    factor = _clamp(factor, 0.05, 9.9)
    probability = _clamp((1.5 - factor) / 1.2 * 100, 0, 100)
    runout_km = max(0.05, height / 1000 * 1.8 * math.sqrt(max(0.2, 1 - factor / 3)))
    index = _clamp(probability * 0.75 + rain / 150 * 25, 0, 100)
    metrics = [
        _metric("facteur_securite", "Facteur de sécurité (FS)", factor, "", "Modèle infini simplifié : cohésion, frottement, pression interstitielle"),
        _metric("probabilite_indicative", "Probabilité indicative de rupture", probability, "%", "Dérivée du facteur de sécurité"),
        _metric("pente_deg", "Pente", slope, "°", "Entrée utilisateur"),
        _metric("pluie_mm_h", "Pluie déclenchante", rain, "mm/h", "Entrée utilisateur"),
        _metric("humidite_sol", "Humidité du sol", moisture, "0–1", "Entrée utilisateur"),
        _metric("distance_parcours_km", "Distance de parcours estimée", runout_km, "km", "Hauteur × pente, très simplifié"),
    ]
    return _result(
        "landslide", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(0.3, runout_km), index=index, metrics=metrics,
        timeline=_timeline(index, 12, decay="pulse"),
        statements=[
            f"Facteur de sécurité estimé : {factor:.2f}. En dessous de 1, la rupture est jugée probable dans ce modèle simplifié.",
            f"La masse pourrait parcourir environ {runout_km * 1000:.0f} m en aval.",
            "La géologie, la stratigraphie et l'eau souterraine réelles ne sont pas connues ici.",
        ],
    )


def simulate_sandstorm(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    wind = _clamp(_number(inputs, "wind_kmh", 80.0), 10, 220)
    duration = _clamp(_number(inputs, "duration_h", 6.0), 0.5, 72)
    visibility = _clamp(20 * math.exp(-(wind - 20) / 25), 0.03, 30)
    transport_km = wind * duration
    index = _clamp((wind - 20) / 140 * 70 + (1 - min(1, visibility / 10)) * 30, 0, 100)
    metrics = [
        _metric("visibilite_km", "Visibilité horizontale", visibility, "km", "Relation empirique vent–visibilité"),
        _metric("vent_kmh", "Vent moyen", wind, "km/h", "Entrée utilisateur"),
        _metric("transport_km", "Portée du transport de poussières", transport_km, "km", "Vent × durée"),
        _metric("duree_h", "Durée", duration, "h", "Entrée utilisateur"),
    ]
    return _result(
        "sandstorm", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(10, transport_km * 0.3), index=index, metrics=metrics,
        timeline=_timeline(index, duration, decay="smooth"),
        statements=[
            f"Visibilité estimée : {visibility:.1f} km ; le transport de poussières peut atteindre ~{transport_km:.0f} km.",
            "Les concentrations de particules dépendent de la granulométrie et de l'humidité du sol.",
        ],
    )


def simulate_blizzard(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    temperature = _clamp(_number(inputs, "temperature_c", -8.0), -70, 10)
    wind = _clamp(_number(inputs, "wind_kmh", 60.0), 0, 200)
    snow = _clamp(_number(inputs, "snow_mm_h", 8.0), 0, 100)
    duration = _clamp(_number(inputs, "duration_h", 12.0), 0.5, 96)
    wind_chill = 13.12 + 0.6215 * temperature - 11.37 * wind**0.16 + 0.3965 * temperature * wind**0.16
    visibility = _clamp(10 * math.exp(-(wind * max(0.2, snow) / 80)), 0.03, 10)
    snow_cm = snow * duration / 10
    index = _clamp(max(0, -wind_chill - 10) / 40 * 60 + (1 - min(1, visibility / 5)) * 40, 0, 100)
    metrics = [
        _metric("refroidissement_eolien_c", "Refroidissement éolien", wind_chill, "°C", "Formule Environment Canada"),
        _metric("visibilite_km", "Visibilité", visibility, "km", "Relation vent–neige simplifiée"),
        _metric("neige_cm", "Accumulation de neige", snow_cm, "cm", "Équivalent eau × durée ÷ 10"),
        _metric("temperature_c", "Température", temperature, "°C", "Entrée utilisateur"),
        _metric("vent_kmh", "Vent", wind, "km/h", "Entrée utilisateur"),
    ]
    return _result(
        "blizzard", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(5, wind * duration / 20), index=index, metrics=metrics,
        timeline=_timeline(index, duration, decay="smooth"),
        statements=[
            f"Refroidissement éolien ressenti : {wind_chill:.0f} °C ; visibilité estimée à {visibility:.1f} km.",
            f"Jusqu'à {snow_cm:.0f} cm de neige pourraient s'accumuler localement.",
        ],
    )


def simulate_heatwave(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    temperature = _clamp(_number(inputs, "temperature_c", 40.0), 20, 60)
    humidity = _clamp(_number(inputs, "humidity_pct", 30.0), 0, 100)
    days = _clamp(_number(inputs, "duration_h", 5.0), 0.5, 60)
    heat_index = temperature
    if temperature >= 27:
        t = temperature * 9 / 5 + 32
        r = humidity
        heat_index_f = (
            -42.379 + 2.04901523 * t + 10.14333127 * r - 0.22475541 * t * r
            - 6.83783e-3 * t * t - 5.481717e-2 * r * r + 1.22874e-3 * t * t * r
            + 8.5282e-4 * t * r * r - 1.99e-6 * t * t * r * r
        )
        heat_index = (heat_index_f - 32) * 5 / 9
    index = _clamp((heat_index - 27) / 20 * 70 + days / 10 * 30, 0, 100)
    metrics = [
        _metric("temperature_c", "Température", temperature, "°C", "Entrée utilisateur"),
        _metric("humidite_pct", "Humidité relative", humidity, "%", "Entrée utilisateur"),
        _metric("indice_chaleur_c", "Indice de chaleur", heat_index, "°C", "Formule de Rothfusz (NWS)"),
        _metric("duree_jours", "Durée", days, "jours", "Entrée utilisateur"),
    ]
    return _result(
        "heatwave", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(10, days * 8), index=index, metrics=metrics,
        timeline=_timeline(index, days, decay="rise"),
        statements=[
            f"L'indice de chaleur atteint {heat_index:.0f} °C, avec un risque sanitaire qui augmente avec la durée.",
            "Les personnes âgées, les enfants et les travailleurs extérieurs sont les plus exposés.",
        ],
    )


def simulate_tornado(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    wind = _clamp(_number(inputs, "wind_kmh", 200.0), 60, 500)
    duration = _clamp(_number(inputs, "duration_h", 0.5), 0.02, 8)
    if wind >= 322:
        ef = 5
    elif wind >= 267:
        ef = 4
    elif wind >= 218:
        ef = 3
    elif wind >= 178:
        ef = 2
    elif wind >= 138:
        ef = 1
    else:
        ef = 0
    path_km = 50 * duration
    width_km = _clamp(wind / 500 * 1.5, 0.03, 2.5)
    area_km2 = path_km * width_km
    index = _clamp((wind - 60) / 360 * 100, 0, 100)
    metrics = [
        _metric("echelle_ef", "Échelle de dommages", f"EF{ef}", "", "Échelle Enhanced Fujita"),
        _metric("vent_kmh", "Vent estimé", wind, "km/h", "Entrée utilisateur"),
        _metric("longueur_trajectoire_km", "Longueur de trajectoire", path_km, "km", "Vitesse de déplacement × durée"),
        _metric("largeur_km", "Largeur du couloir", width_km, "km", "Relation empirique vent–largeur"),
        _metric("surface_km2", "Surface du couloir", area_km2, "km²", "Longueur × largeur"),
    ]
    return _result(
        "tornado", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(1, path_km / 2), index=index, metrics=metrics,
        timeline=_timeline(index, max(0.1, duration), decay="pulse"),
        statements=[
            f"Tornade de catégorie EF{ef} : couloir de dommages d'environ {path_km:.1f} km de long et {width_km * 1000:.0f} m de large.",
            "La trajectoire d'une tornade reste très difficile à prévoir localement.",
        ],
    )


def simulate_storm(inputs: dict[str, Any], lat: float, lon: float, name: str | None) -> dict[str, Any]:
    wind = _clamp(_number(inputs, "wind_kmh", 90.0), 20, 250)
    rain = _clamp(_number(inputs, "rain_mm_h", 25.0), 0, 200)
    duration = _clamp(_number(inputs, "duration_h", 3.0), 0.2, 36)
    hail_cm = _clamp((wind - 60) / 30, 0, 8)
    index = _clamp(wind / 200 * 55 + rain / 100 * 30 + duration / 12 * 15, 0, 100)
    metrics = [
        _metric("wind_kmh", "Rafales", wind, "km/h", "Entrée utilisateur"),
        _metric("pluie_mm_h", "Intensité de pluie", rain, "mm/h", "Entrée utilisateur"),
        _metric("grele_cm", "Grêle indicative", hail_cm, "cm", "Relation simplifiée rafales–grêle"),
        _metric("duree_h", "Durée", duration, "h", "Entrée utilisateur"),
    ]
    return _result(
        "storm", inputs, lat=lat, lon=lon, center_name=name,
        radius_km=max(5, wind * duration / 10), index=index, metrics=metrics,
        timeline=_timeline(index, duration, decay="smooth"),
        statements=[
            f"Orage avec rafales d'environ {wind:.0f} km/h et pluie soutenue ; grêle possible jusqu'à {hail_cm:.0f} cm.",
            "Les orages localisés peuvent produire des rafales descendantes et des inondations éclair.",
        ],
    )


SIMULATORS = {
    "earthquake": simulate_earthquake,
    "tsunami": simulate_tsunami,
    "volcano": simulate_volcano,
    "hurricane": simulate_hurricane,
    "flood": simulate_flood,
    "wildfire": simulate_wildfire,
    "drought": simulate_drought,
    "landslide": simulate_landslide,
    "sandstorm": simulate_sandstorm,
    "blizzard": simulate_blizzard,
    "heatwave": simulate_heatwave,
    "tornado": simulate_tornado,
    "storm": simulate_storm,
}


def simulate(hazard: str, inputs: dict[str, Any], lat: float, lon: float, name: str | None = None) -> dict[str, Any]:
    """Point d'entrée pur : valide l'aléa et délègue au simulateur."""
    simulator = SIMULATORS.get(hazard)
    if simulator is None:
        raise ValueError(f"Aléa inconnu : {hazard}")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Coordonnées hors limites.")
    return simulator(inputs, lat, lon, name)
