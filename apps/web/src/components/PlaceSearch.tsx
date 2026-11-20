import { useEffect, useRef, useState } from "react";
import {
  displayPlaceName,
  loadPlaces,
  Place,
  placeSubtitle,
  searchPlaceList,
} from "../globe/places";

type Props = {
  onSelect: (place: Place) => void;
};

/**
 * Recherche de lieux mondiale.
 *
 * Le jeu GeoNames embarqué (`/geo/places.json`, villes de 15 000 habitants et
 * plus) couvre le monde entier : la recherche ne dépend donc ni d'un pays, ni
 * d'une connexion à un service de géocodage externe, ni d'un compte.
 */
export function PlaceSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<readonly Place[]>([]);
  const [datasetLoading, setDatasetLoading] = useState(true);
  const [datasetError, setDatasetError] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setDatasetLoading(true);
    void loadPlaces()
      .then((dataset) => {
        if (cancelled) return;
        setPlaces(dataset.places);
        setDatasetError(false);
      })
      .catch(() => {
        if (!cancelled) setDatasetError(true);
      })
      .finally(() => {
        if (!cancelled) setDatasetLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (!needle) {
      setResults([]);
      setShowResults(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      setResults(searchPlaceList(places, needle, 10));
      setShowResults(true);
      setSearching(false);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [places, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(event.target as Node) &&
          resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (place: Place) => {
    onSelect(place);
    setQuery(displayPlaceName(place));
    setShowResults(false);
    inputRef.current?.blur();
  };

  const loading = datasetLoading || searching;
  const noResult = showResults && query.trim() && results.length === 0 && !loading && !datasetError;

  return (
    <div className="place-search" style={{ position: "relative", width: "100%", maxWidth: "320px" }}>
      <label htmlFor="place-search" className="visually-hidden">Rechercher un lieu dans le monde</label>
      <input
        ref={inputRef}
        id="place-search"
        type="text"
        placeholder="Rechercher une ville dans le monde…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
        onFocus={() => query.trim() && setShowResults(true)}
        onBlur={() => setTimeout(() => setShowResults(false), 150)}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls="place-results"
        aria-expanded={showResults}
        aria-busy={loading}
        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #1d4263", background: "#0a1a28", color: "#d1e4f0", fontSize: "0.85rem" }}
      />
      {loading && <span className="place-search-spinner" aria-hidden="true" style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)" }}>⟳</span>}
      {showResults && results.length > 0 && (
        <div ref={resultsRef} id="place-results" role="listbox" className="place-results" style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px",
          background: "#0b1d2e", border: "1px solid #1d4263", borderRadius: "8px",
          maxHeight: "280px", overflow: "auto", zIndex: 1000, boxShadow: "0 8px 24px rgba(0,0,0,.35)"
        }}>
          {results.map((place) => {
            const subtitle = placeSubtitle(place);
            return (
              <button
                key={`${place.name}-${place.countryCode}-${place.lat}-${place.lon}`}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(place)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px", width: "100%",
                  padding: "9px 12px", textAlign: "left", background: "transparent",
                  border: "none", color: "#d1e4f0", fontSize: "0.85rem", cursor: "pointer",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#12304a"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <span aria-hidden="true" style={{ fontSize: "1rem" }}>🏙</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  <strong style={{ display: "block", fontWeight: 600 }}>{displayPlaceName(place)}</strong>
                  {subtitle && <small style={{ color: "#9cbacf" }}>{subtitle}</small>}
                </span>
                <small style={{ color: "#9cbacf", marginLeft: "auto", flex: "none" }}>
                  {place.lat.toFixed(2)}, {place.lon.toFixed(2)}
                </small>
              </button>
            );
          })}
        </div>
      )}
      {noResult && (
        <div id="place-results" className="place-results" style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px",
          background: "#0b1d2e", border: "1px solid #1d4263", borderRadius: "8px",
          padding: "12px", color: "#9cbacf", fontSize: "0.8rem"
        }}>
          Aucun lieu trouvé pour « {query} »
        </div>
      )}
      {datasetError && query.trim() && (
        <div className="place-results" role="alert" style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px",
          background: "#0b1d2e", border: "1px solid #70414a", borderRadius: "8px",
          padding: "12px", color: "#e6a4ad", fontSize: "0.8rem"
        }}>
          Recherche mondiale indisponible : le jeu de lieux n'a pas pu être chargé.
        </div>
      )}
    </div>
  );
}
