import { describe, expect, it } from "vitest";
import {
  answerLocalQuestion,
  platformHelp,
  platformOverview,
  PLATFORM_SECTIONS,
  situationSummary,
} from "./platformKnowledge";
import { AlertItem, SensorState, WeatherItem } from "./api";

const sensor: SensorState = {
  code: "CI-ABJ-001",
  name: "Cocody — pont",
  lon: -3.98,
  lat: 5.36,
  status: "active",
  alert_level: "red",
  water_level_cm: 92,
  last_measured_at: new Date().toISOString(),
  health_status: "online",
  minutes_since_last_reading: 0,
};

const alert: AlertItem = {
  id: 1,
  sensor_code: "CI-ABJ-001",
  level: "red",
  water_level_cm: 92,
  triggered_at: new Date().toISOString(),
  message: "Seuil rouge franchi",
};

const weather: WeatherItem = {
  name: "Open-Meteo 5,36,-4,01",
  source: "open-meteo",
  lat: 5.36,
  lon: -4.01,
  updated_at: new Date().toISOString(),
  intensity_3h_mm_h: 0,
  forecast_intensity_3h_mm_h: 18,
  observed_precip_mm_h: null,
  modeled_precip_mm_h: 24.5,
  accumulated_24h_mm: 40,
  level: "orange",
};

describe("catalogue de la plateforme", () => {
  it("couvre les pages, les cartes, les données et les limites", () => {
    const keys = PLATFORM_SECTIONS.map((section) => section.key);
    expect(keys).toEqual(expect.arrayContaining(["pages", "maps", "data", "calculations", "ai", "privacy", "availability", "limits"]));
    const text = PLATFORM_SECTIONS.flatMap((section) => section.lines).join(" ");
    expect(text).toContain("monde");
    expect(text).not.toMatch(/\bTODO\b|\bÀ DÉFINIR\b/);
  });

  it("présente la plateforme et les commandes disponibles", () => {
    expect(platformOverview()).toMatch(/mondiale/);
    expect(platformOverview()).toMatch(/monde entier/);
    expect(platformHelp()).toMatch(/va à <lieu>/);
    expect(platformHelp()).toMatch(/ne déclenche aucune alerte/);
  });
});

describe("synthèse déterministe", () => {
  it("résume les données disponibles sans prétendre à une prévision", () => {
    const summary = situationSummary({ sensors: [sensor], alerts: [alert], weather: [weather] });
    expect(summary).toContain("1 capteur(s)");
    expect(summary).toContain("24,5");
    expect(summary).toMatch(/provisoires/);
  });

  it("signale une situation calme", () => {
    const summary = situationSummary({
      sensors: [{ ...sensor, alert_level: "green" }],
      alerts: [],
      weather: [],
    });
    expect(summary).toMatch(/aucune précipitation/);
    expect(summary).toMatch(/0 hors niveau vert/);
  });

  it("ajoute la position et la phase du jour quand elles sont connues", () => {
    const summary = situationSummary({
      sensors: [],
      alerts: [],
      weather: [],
      position: { lat: 48.85, lon: 2.35, accuracyM: 15, timestamp: Date.now() },
      now: new Date("2026-06-21T12:00:00Z"),
    });
    expect(summary).toContain("48,85° N");
    expect(summary).toMatch(/jour/);
  });
});

describe("questions locales", () => {
  it("répond aux questions sur la plateforme sans modèle", () => {
    expect(answerLocalQuestion("Que sais-tu faire ?", { sensors: [], alerts: [], weather: [] })?.intent).toBe("help");
    expect(answerLocalQuestion("C'est quoi MasterEarth ?", { sensors: [], alerts: [], weather: [] })?.intent).toBe("overview");
    expect(answerLocalQuestion("C'est quoi IntelliFlood ?", { sensors: [], alerts: [], weather: [] })?.intent).toBe("overview");
    expect(answerLocalQuestion("Quelles sont les sources de données ?", { sensors: [], alerts: [], weather: [] })?.intent).toBe("sources");
    expect(answerLocalQuestion("Mes données personnelles sont-elles privées ?", { sensors: [], alerts: [], weather: [] })?.intent).toBe("privacy");
    expect(answerLocalQuestion("Comment est calculée la simulation ?", { sensors: [], alerts: [], weather: [] })?.intent).toBe("simulation");
    expect(answerLocalQuestion("Faut-il un compte ?", { sensors: [], alerts: [], weather: [] })?.intent).toBe("account");
  });

  it("laisse passer une question qui nécessite le modèle", () => {
    expect(answerLocalQuestion("Compare les tendances de la semaine aux années précédentes.", {
      sensors: [sensor],
      alerts: [alert],
      weather: [weather],
    })).toBeNull();
  });

  it("répond sur les alertes à partir des données en mémoire", () => {
    const answer = answerLocalQuestion("Y a-t-il des alertes ?", {
      sensors: [sensor],
      alerts: [alert],
      weather: [weather],
    });
    expect(answer?.intent).toBe("alerts");
    expect(answer?.answer).toMatch(/provisoires/);
  });

  it("répond sur la circulation sans la présenter comme une observation", () => {
    const answer = answerLocalQuestion("Est-ce que les voitures bougent en temps réel ?", {
      sensors: [],
      alerts: [],
      weather: [],
    });
    expect(answer?.intent).toBe("traffic");
    expect(answer?.answer).toMatch(/modèle/);
    expect(answer?.answer).toMatch(/pas une observation/);
    expect(answer?.answer).toMatch(/OpenStreetMap/);
  });

  it("confirme qu'il n'y a plus de maillage et que les lieux sont nommés", () => {
    const answer = answerLocalQuestion("C'est quoi le maillage météo ?", {
      sensors: [],
      alerts: [],
      weather: [],
    });
    expect(answer?.intent).toBe("sampling");
    expect(answer?.answer).toMatch(/plus aucun maillage/);
    expect(answer?.answer).toMatch(/rue|quartier|localité/);
    expect(answer?.answer).toMatch(/rien n'est limité à un pays/);
  });

  it("répond sur la recherche de lieux mondiale", () => {
    const answer = answerLocalQuestion("Comment rechercher une ville ?", {
      sensors: [],
      alerts: [],
      weather: [],
    });
    expect(answer?.intent).toBe("search");
    expect(answer?.answer).toMatch(/mondial/);
    expect(answer?.answer).toMatch(/Photon/);
  });

  it("répond sur les statistiques de pluie mondiales sans zéro trompeur", () => {
    const answer = answerLocalQuestion("Pourquoi 0 point en pluie dans le monde ?", {
      sensors: [],
      alerts: [],
      weather: [],
    });
    expect(answer?.intent).toBe("globalrain");
    expect(answer?.answer).toMatch(/198/);
    expect(answer?.answer).toMatch(/jamais un zéro/);
    expect(answer?.answer).toMatch(/global-rain/);
  });

  it("répond sur la disponibilité partielle sans vider les couches", () => {
    const answer = answerLocalQuestion("Pourquoi l'application est hors ligne ?", {
      sensors: [],
      alerts: [],
      weather: [],
    });
    expect(answer?.intent).toBe("availability");
    expect(answer?.answer).toMatch(/dernières valeurs connues/);
    expect(answer?.answer).toMatch(/start\.bat health/);
  });
});
