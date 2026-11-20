"""Tests des agrégateurs d'aléas : parsers, déduplication et provenance."""

from datetime import datetime, timezone

import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

from app.main import app
from app.services import hazards


def test_http_routes_expose_snapshot_contract_and_provenance(monkeypatch):
    moment = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)
    event = hazards.HazardEvent(
        id="usgs_earthquakes:test",
        source="usgs_earthquakes",
        source_id="test",
        hazard="earthquake",
        title="M 5.9 - 10 km N of Example",
        place="10 km N of Example",
        lat=45.2,
        lon=10.5,
        time=moment,
        updated=None,
        severity="moderate",
        data_kind="observation",
        metrics=({"key": "magnitude", "label": "Magnitude", "value": 5.9, "unit": "Mw", "basis": "USGS"},),
    )
    state = hazards.SourceState(
        id="usgs_earthquakes",
        name="USGS Earthquakes",
        status="ok",
        count=1,
        fetched_at=moment,
        attribution="USGS",
        attribution_url="https://earthquake.usgs.gov/",
        license="Domaine public",
    )
    snapshot = hazards.HazardSnapshot(
        events=(event,),
        sources=(state,),
        generated_at=moment,
        stale=False,
        degraded=False,
    )
    monkeypatch.setattr(hazards, "allow_request", lambda _host: True)
    monkeypatch.setattr(hazards, "load_snapshot", lambda: snapshot)

    client = TestClient(app)
    response = client.get("/api/v1/hazards")

    assert response.status_code == 200
    assert "max-age=45" in response.headers["cache-control"]
    body = response.json()
    assert body["scope"] == "worldwide"
    assert body["total_events"] == 1
    assert body["counts_by_type"]["earthquake"] == 1
    assert body["events"][0]["place"] == "10 km N of Example"
    assert body["events"][0]["metrics"][0]["value"] == 5.9
    assert body["sources"][0]["attribution_url"] == "https://earthquake.usgs.gov/"
    assert body["limitations"]

    catalog = client.get("/api/v1/hazards/catalog")
    assert catalog.status_code == 200
    payload = catalog.json()
    assert payload["count"] == 13
    assert {item["id"] for item in payload["hazards"]} == {
        "earthquake", "tsunami", "volcano", "hurricane", "flood", "wildfire",
        "drought", "landslide", "sandstorm", "blizzard", "heatwave", "tornado", "storm",
    }
    assert all(item["simulation_fields"] for item in payload["hazards"])


def test_parse_usgs_earthquakes_keeps_published_values():
    payload = {
        "features": [
            {
                "id": "us7000abcd",
                "properties": {
                    "mag": 6.4,
                    "place": "12 km SW of Example City",
                    "time": 1_760_000_000_000,
                    "updated": 1_760_000_600_000,
                    "url": "https://earthquake.usgs.gov/event/us7000abcd",
                    "sig": 630,
                    "mmi": 7.2,
                    "felt": 120,
                    "code": "us7000abcd",
                },
                "geometry": {"type": "Point", "coordinates": [10.5, 45.2, 12.0]},
            }
        ]
    }

    events = hazards.parse_usgs_earthquakes(payload)

    assert len(events) == 1
    event = events[0]
    assert event.hazard == "earthquake"
    assert event.severity == "high"
    assert event.place == "12 km SW of Example City"
    assert event.lat == 45.2
    assert event.lon == 10.5
    metrics = {metric["key"]: metric["value"] for metric in event.metrics}
    assert metrics["magnitude"] == 6.4
    assert metrics["profondeur_km"] == 12.0
    assert metrics["significance"] == 630


def test_parse_gdacs_feed_maps_categories_and_alert_levels():
    xml = """<?xml version="1.0" encoding="utf-8"?>
    <rss xmlns:gdacs="http://www.gdacs.org" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:georss="http://www.georss.org/georss">
      <channel>
        <item>
          <title>Orange notification for tropical cyclone AKVAN-26.</title>
          <description>From 16/11 to 18/11, a Tropical Storm was active in NorthIndian.</description>
          <link>https://www.gdacs.org/report.aspx?eventtype=TC&amp;eventid=1001351</link>
          <pubDate>Mon, 16 Nov 2026 20:06:39 GMT</pubDate>
          <guid>TC1001351</guid>
          <georss:point>13.1 86.9</georss:point>
          <gdacs:fromdate>Mon, 16 Nov 2026 18:00:00 GMT</gdacs:fromdate>
          <gdacs:datemodified>Wed, 18 Nov 2026 08:21:15 GMT</gdacs:datemodified>
          <gdacs:iscurrent>true</gdacs:iscurrent>
          <gdacs:eventtype>TC</gdacs:eventtype>
          <gdacs:alertlevel>Orange</gdacs:alertlevel>
          <gdacs:alertscore>2</gdacs:alertscore>
          <gdacs:eventname>AKVAN-26</gdacs:eventname>
          <gdacs:severity>Tropical Storm (maximum wind speed of 83 km/h)</gdacs:severity>
          <gdacs:country>India</gdacs:country>
          <gdacs:population>28 million in Tropical Storm</gdacs:population>
        </item>
        <item>
          <title>Green wildfire in Exampleland.</title>
          <guid>WF42</guid>
          <pubDate>Mon, 16 Nov 2026 20:06:39 GMT</pubDate>
          <gdacs:iscurrent>true</gdacs:iscurrent>
          <gdacs:eventtype>WF</gdacs:eventtype>
          <gdacs:alertlevel>Green</gdacs:alertlevel>
          <gdacs:fromdate>Mon, 16 Nov 2026 18:00:00 GMT</gdacs:fromdate>
          <georss:point>-5.0 20.0</georss:point>
        </item>
      </channel>
    </rss>"""

    events = hazards.parse_gdacs_feed(ET.fromstring(xml))

    assert len(events) == 2
    cyclone = next(event for event in events if event.hazard == "hurricane")
    wildfire = next(event for event in events if event.hazard == "wildfire")
    assert cyclone.source == "gdacs"
    assert cyclone.severity == "high"
    assert cyclone.lat == 13.1
    assert cyclone.lon == 86.9
    assert wildfire.severity == "low"
    assert any(metric["key"] == "wind_kmh" for metric in cyclone.metrics)


def test_parse_eonet_converts_knots_and_infers_storm_category():
    payload = {
        "events": [
            {
                "id": "EONET_1",
                "title": "Tropical Cyclone Akvan",
                "categories": [{"id": "severeStorms", "title": "Severe Storms"}],
                "sources": [{"id": "JTWC", "url": "https://example.test/cyclone"}],
                "geometry": [
                    {
                        "magnitudeValue": 100,
                        "magnitudeUnit": "kts",
                        "date": "2026-11-17T12:00:00Z",
                        "type": "Point",
                        "coordinates": [86.8, 11.4],
                    }
                ],
            }
        ]
    }

    events = hazards.parse_eonet_events(payload)

    assert len(events) == 1
    event = events[0]
    assert event.hazard == "hurricane"
    assert event.severity == "high"
    assert event.place is None
    assert event.metrics[0]["value"] == 185.2
    assert event.metrics[0]["unit"] == "km/h"
    assert event.url == "https://example.test/cyclone"


def test_parse_eonet_skips_icebergs_and_prescribed_fires():
    def event(event_id, title, category):
        return {
            "id": event_id,
            "title": title,
            "categories": [{"id": category, "title": category}],
            "geometry": [
                {
                    "date": "2026-11-18T00:00:00Z",
                    "type": "Point",
                    "coordinates": [10.0, 20.0],
                }
            ],
        }

    payload = {
        "events": [
            event("ice", "Iceberg A81", "seaLakeIce"),
            event("burn", "Prescribed Fire RX - Example", "wildfires"),
            event("snow", "Snowstorm Example", "snow"),
        ]
    }

    events = hazards.parse_eonet_events(payload)

    assert len(events) == 1
    assert events[0].hazard == "blizzard"
    assert events[0].title == "Snowstorm Example"


def test_parse_usgs_volcanoes_uses_alert_level_severity():
    payload = [
        {
            "volcano_name_appended": "Great Sitkin Volcano",
            "latitude": 52.0765,
            "longitude": -176.1109,
            "elevation_meters": 1740,
            "obs_fullname": "Alaska Volcano Observatory",
            "alert_level": "WATCH",
            "color_code": "ORANGE",
            "sent_date_cap": "2026-11-13T12:04:48-09:00",
            "notice_url": "https://volcanoes.usgs.gov/notice/1",
            "guid": "notice-1",
            "synopsis": "Slow eruption of lava continues.",
        }
    ]

    events = hazards.parse_usgs_volcanoes(payload)

    assert len(events) == 1
    event = events[0]
    assert event.hazard == "volcano"
    assert event.severity == "high"
    assert "Great Sitkin" in event.place
    metrics = {metric["key"]: metric["value"] for metric in event.metrics}
    assert metrics["altitude_m"] == 1740
    assert metrics["niveau_alerte"] == "WATCH"


def test_parse_tsunami_atom_keeps_warning_and_skips_information():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#">
      <entry>
        <title>Coastal region</title>
        <updated>2026-11-13T23:30:02Z</updated>
        <geo:lat>58.400</geo:lat>
        <geo:long>-151.000</geo:long>
        <id>urn:uuid:warning</id>
        <summary type="xhtml"><div><strong>Category:</strong> Warning<br/><strong>Preliminary Magnitude:</strong> 8.1(Mwp)</div></summary>
        <link rel="alternate" href="https://www.tsunami.gov/warning" />
      </entry>
      <entry>
        <title>Information area</title>
        <updated>2026-11-13T23:31:02Z</updated>
        <geo:lat>58.400</geo:lat>
        <geo:long>-151.000</geo:long>
        <id>urn:uuid:info</id>
        <summary type="xhtml"><div><strong>Category:</strong> Information<br/>There is NO tsunami danger from this earthquake.</div></summary>
      </entry>
    </feed>"""

    events = hazards.parse_tsunami_atom(ET.fromstring(xml), "PAAQ")

    assert len(events) == 1
    event = events[0]
    assert event.hazard == "tsunami"
    assert event.severity == "extreme"
    assert event.place == "Coastal region"
    assert event.url == "https://www.tsunami.gov/warning"
    assert event.metrics[0]["value"] == "Warning"


def test_parse_nhc_storms_handles_empty_and_coordinates():
    assert hazards.parse_nhc_storms({"activeStorms": []}) == []
    payload = {
        "activeStorms": [
            {
                "id": "al012026",
                "name": "Example",
                "classification": "Hurricane",
                "intensity": "100",
                "pressure": "960",
                "latitude": "22.4N",
                "longitude": "75.1W",
                "lastUpdate": "2026-11-18T12:00:00Z",
                "publicAdvisory": "https://www.nhc.noaa.gov/advisory",
            }
        ]
    }

    events = hazards.parse_nhc_storms(payload)

    assert len(events) == 1
    event = events[0]
    assert event.hazard == "hurricane"
    assert event.lat == 22.4
    assert event.lon == -75.1
    assert event.severity == "high"
    assert event.metrics[0]["value"] == 185.2


def test_dedupe_prefers_specialised_source_and_records_other_sources():
    moment = datetime(2026, 11, 18, 6, 0, tzinfo=timezone.utc)
    usgs = hazards.HazardEvent(
        id="usgs_earthquakes:1", source="usgs_earthquakes", source_id="1",
        hazard="earthquake", title="M 5.9", place="Peru", lat=-15.1, lon=-75.9,
        time=moment, updated=None, severity="moderate", data_kind="observation",
    )
    gdacs = hazards.HazardEvent(
        id="gdacs:EQ1", source="gdacs", source_id="EQ1",
        hazard="earthquake", title="Green earthquake", place="Peru", lat=-15.14, lon=-75.92,
        time=moment, updated=None, severity="low", data_kind="alert",
    )

    result = hazards.dedupe([gdacs, usgs])

    assert len(result) == 1
    assert result[0].source == "usgs_earthquakes"
    assert result[0].also_reported_by == ("gdacs",)


def test_load_snapshot_reports_each_source_without_inventing_events():
    moment = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)
    hazards.reset_cache()

    def failing():
        raise RuntimeError("source indisponible")

    def good():
        return [hazards.HazardEvent(
            id="gdacs:test", source="gdacs", source_id="test",
            hazard="flood", title="Inondation réelle", place="Lieu réel",
            lat=4.0, lon=-3.0, time=moment, updated=None,
            severity="high", data_kind="alert",
        )]

    snapshot = hazards.load_snapshot(
        now=moment,
        fetchers={"gdacs": good, "nasa_eonet": failing, "nhc": lambda: []},
    )
    body = hazards.payload(snapshot, now=moment)

    assert body["available"] is True
    assert body["total_events"] == 1
    assert body["counts_by_type"]["flood"] == 1
    assert body["counts_by_type"]["earthquake"] == 0
    states = {source["id"]: source for source in body["sources"]}
    assert states["gdacs"]["status"] == "ok"
    assert states["nasa_eonet"]["status"] == "unavailable"
    assert "source indisponible" in states["nasa_eonet"]["error"]
    assert states["nhc"]["status"] == "ok"
    assert states["nhc"]["count"] == 0


def test_load_snapshot_returns_stale_cache_when_every_source_fails():
    moment = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)
    hazards.reset_cache()

    def good():
        return [hazards.HazardEvent(
            id="gdacs:test", source="gdacs", source_id="test",
            hazard="wildfire", title="Feu réel", place="Lieu réel",
            lat=4.0, lon=-3.0, time=moment, updated=None,
            severity="low", data_kind="alert",
        )]

    hazards.load_snapshot(now=moment, fetchers={"gdacs": good})
    stale = hazards.load_snapshot(
        now=moment.replace(minute=5),
        force=True,
        fetchers={"gdacs": lambda: (_ for _ in ()).throw(RuntimeError("panne"))},
    )
    body = hazards.payload(stale, now=moment.replace(minute=5))

    assert stale.stale is True
    assert body["available"] is True
    assert body["total_events"] == 1
    assert body["age_seconds"] == 300
