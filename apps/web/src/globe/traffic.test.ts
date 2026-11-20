import { describe, expect, it } from "vitest";
import {
  bearingDegrees,
  buildSeaTraffic,
  buildTraffic,
  buildWorldFlow,
  distanceMeters,
  globalCorridors,
  GLOBAL_HUBS,
  hashString,
  parseRoadsPayload,
  pointAlong,
  prepareRoad,
  Road,
  seaTrafficVisibility,
  seededUnit,
  trafficVisibility,
  vehicleSprite,
  vesselSprite,
  worldFlowVisibility,
} from "./traffic";

const ROAD: Road = {
  id: "42",
  roadClass: "primary",
  oneway: 0,
  maxSpeedKmh: null,
  // Segment plein est d'environ 11 km à l'équateur.
  points: [[-4.0, 5.3], [-3.9, 5.3]],
};

describe("hashString / seededUnit", () => {
  it("est stable pour une même chaîne et varie d'une chaîne à l'autre", () => {
    expect(hashString("route-1")).toBe(hashString("route-1"));
    expect(hashString("route-1")).not.toBe(hashString("route-2"));
  });

  it("produit des valeurs dans [0, 1)", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const value = seededUnit(seed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("pointAlong", () => {
  it("renvoie les extrémités et le milieu du tracé", () => {
    const prepared = prepareRoad(ROAD);
    const start = pointAlong(prepared, 0);
    const middle = pointAlong(prepared, prepared.length / 2);
    const end = pointAlong(prepared, prepared.length);

    expect(start.lon).toBeCloseTo(-4.0, 5);
    expect(start.lat).toBeCloseTo(5.3, 5);
    expect(middle.lon).toBeCloseTo(-3.95, 2);
    expect(end.lon).toBeCloseTo(-3.9, 5);
    expect(middle.headingDeg).toBeGreaterThan(80);
    expect(middle.headingDeg).toBeLessThan(100);
  });

  it("borne les distances hors du tracé", () => {
    const prepared = prepareRoad(ROAD);
    expect(pointAlong(prepared, -50).lon).toBeCloseTo(-4.0, 5);
    expect(pointAlong(prepared, prepared.length + 500).lon).toBeCloseTo(-3.9, 5);
  });
});

describe("distanceMeters / bearingDegrees", () => {
  it("mesure une distance plausible et un cap cohérent", () => {
    const distance = distanceMeters([0, 0], [0, 1]);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
    expect(bearingDegrees([0, 0], [0, 1])).toBeCloseTo(0, 0);
    expect(bearingDegrees([0, 0], [1, 0])).toBeCloseTo(90, 0);
  });
});

describe("buildTraffic", () => {
  const roads: Road[] = [
    ROAD,
    { ...ROAD, id: "43", roadClass: "motorway", oneway: 1 },
    { ...ROAD, id: "44", roadClass: "residential", oneway: -1 },
  ];

  it("produit des véhicules déterministes pour un instant donné", () => {
    const now = 1_760_000_000_000;
    const first = buildTraffic(roads, now);
    const second = buildTraffic(roads, now);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("avance en temps réel : la position change avec l'heure", () => {
    const now = 1_760_000_000_000;
    const before = buildTraffic(roads, now);
    const after = buildTraffic(roads, now + 10_000);
    const moved = before.filter((vehicle, index) => vehicle.lon !== after[index]?.lon);
    expect(moved.length).toBeGreaterThan(0);
  });

  it("respecte le budget demandé", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ ...ROAD, id: `r${index}` }));
    expect(buildTraffic(many, 1_760_000_000_000, { budget: 25 })).toHaveLength(25);
  });

  it("circule dans les deux sens sur une voie à double sens, et dans un seul sinon", () => {
    const twoWay = buildTraffic([ROAD], 1_760_000_000_000, { budget: 200 });
    const headings = new Set(twoWay.map((vehicle) => Math.round(vehicle.headingDeg / 45)));
    expect(headings.size).toBeGreaterThan(1);

    const oneWay = buildTraffic([{ ...ROAD, oneway: 1 }], 1_760_000_000_000, { budget: 200 });
    const unique = new Set(oneWay.map((vehicle) => Math.round(vehicle.headingDeg)));
    expect(unique.size).toBe(1);
  });

  it("ignore les voies trop courtes et les listes vides", () => {
    expect(buildTraffic([], 1_760_000_000_000)).toEqual([]);
    const tiny: Road = { ...ROAD, points: [[-4, 5.3], [-4.00001, 5.3]] };
    expect(buildTraffic([tiny], 1_760_000_000_000)).toEqual([]);
  });

  it("donne des vitesses réalistes par classe de voie", () => {
    const vehicles = buildTraffic([ROAD], 1_760_000_000_000, { budget: 50 });
    for (const vehicle of vehicles) {
      expect(vehicle.speedKmh).toBeGreaterThan(5);
      expect(vehicle.speedKmh).toBeLessThan(200);
    }
  });
});

describe("buildSeaTraffic", () => {
  it("place des navires sur les liaisons portuaires et les fait avancer", () => {
    const now = 1_760_000_000_000;
    const first = buildSeaTraffic(now);
    const second = buildSeaTraffic(now);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(10);

    const later = buildSeaTraffic(now + 3_600_000);
    const moved = first.filter((vessel, index) => vessel.lon !== later[index]?.lon);
    expect(moved.length).toBeGreaterThan(0);
    for (const vessel of first) {
      expect(vessel.from).not.toBe(vessel.to);
      expect(vessel.lat).toBeGreaterThan(-90);
      expect(vessel.lat).toBeLessThan(90);
    }
  });

  it("respecte le budget", () => {
    expect(buildSeaTraffic(1_760_000_000_000, 12)).toHaveLength(12);
  });
});

describe("visibilité", () => {
  it("masque le trafic routier quand on s'éloigne", () => {
    expect(trafficVisibility(2_000)).toBe(1);
    expect(trafficVisibility(300_000)).toBeGreaterThan(0);
    expect(trafficVisibility(300_000)).toBeLessThan(1);
    expect(trafficVisibility(900_000)).toBe(0);
  });

  it("garde les navires visibles à l'échelle du globe", () => {
    expect(seaTrafficVisibility(50_000)).toBe(1);
    expect(seaTrafficVisibility(2_000_000)).toBeGreaterThan(0.6);
    // La vue mondiale doit rester animée : plus aucun disparition totale.
    expect(seaTrafficVisibility(6_000_000)).toBeGreaterThan(0.5);
    expect(seaTrafficVisibility(25_000_000)).toBeGreaterThan(0.5);
  });

  it("fait prendre le relais au flux mondial quand les rues ne sont plus lisibles", () => {
    expect(worldFlowVisibility(100_000)).toBe(0);
    expect(worldFlowVisibility(650_000)).toBe(0);
    expect(worldFlowVisibility(1_500_000)).toBeGreaterThan(0);
    expect(worldFlowVisibility(20_000_000)).toBeGreaterThan(0.8);
  });
});

describe("flux mondial", () => {
  it("relie des métropoles réelles sans franchir l'antiméridien", () => {
    const corridors = globalCorridors();
    expect(corridors.length).toBeGreaterThan(30);
    for (const corridor of corridors) {
      const from = GLOBAL_HUBS[corridor.from];
      const to = GLOBAL_HUBS[corridor.to];
      expect(Math.abs(from.lon - to.lon)).toBeLessThan(120);
      expect(corridor.lengthM).toBeGreaterThan(120_000);
    }
  });

  it("avance dans le temps de façon déterministe", () => {
    const first = buildWorldFlow(1_760_000_000_000, 80);
    const same = buildWorldFlow(1_760_000_000_000, 80);
    const later = buildWorldFlow(1_760_000_000_000 + 60_000, 80);
    expect(first).toHaveLength(80);
    expect(same).toEqual(first);
    expect(later).not.toEqual(first);
    expect(later.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))).toBe(true);
    expect(later.some((point, index) => point.lat !== first[index].lat || point.lon !== first[index].lon)).toBe(true);
  });
});

describe("parseRoadsPayload", () => {
  it("accepte une charge utile valide et écarte les entrées inutilisables", () => {
    const roads = parseRoadsPayload({
      roads: [
        { id: "a", class: "primary", oneway: 1, max_speed_kmh: 60, points: [[-4, 5.3], [-3.9, 5.3]] },
        { id: "b", class: "footway", points: [[-4, 5.3], [-3.9, 5.3]] },
        { id: "c", class: "residential", points: [[-4, 5.3]] },
        { id: "d", class: "residential", points: [["x", 5.3], [-3.9, 5.3]] },
        "pas une route",
      ],
    });
    expect(roads).toHaveLength(1);
    expect(roads[0]).toMatchObject({ id: "a", roadClass: "primary", oneway: 1, maxSpeedKmh: 60 });
  });

  it("tolère les charges utiles absentes", () => {
    expect(parseRoadsPayload(null)).toEqual([]);
    expect(parseRoadsPayload({})).toEqual([]);
    expect(parseRoadsPayload({ roads: "nope" })).toEqual([]);
  });
});

describe("sprites", () => {
  it("produit des images SVG distinctes par type de véhicule", () => {
    const car = vehicleSprite("car");
    const truck = vehicleSprite("truck");
    expect(car.startsWith("data:image/svg+xml")).toBe(true);
    expect(car).not.toBe(truck);
    expect(vesselSprite().startsWith("data:image/svg+xml")).toBe(true);
  });
});
