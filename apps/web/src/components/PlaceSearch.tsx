import { useEffect, useRef, useState } from "react";
import { Place, searchPlaces, reverseGeocode } from "../services/geocoding";

type Props = {
  token: string;
  onSelect: (place: Place) => void;
};

export function PlaceSearch({ token, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const places = await searchPlaces(token, query);
        setResults(places);
        setShowResults(places.length > 0);
      } catch {
        setResults([]);
        setShowResults(false);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, token]);

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
    setQuery(place.name);
    setShowResults(false);
    inputRef.current?.blur();
  };

  return (
    <div className="place-search" style={{ position: "relative", width: "100%", maxWidth: "320px" }}>
      <label htmlFor="place-search" className="visually-hidden">Rechercher un lieu</label>
      <input
        ref={inputRef}
        id="place-search"
        type="text"
        placeholder="Rechercher une ville, un quartier…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
        onFocus={() => query.trim() && setShowResults(true)}
        onBlur={() => setTimeout(() => setShowResults(false), 150)}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls="place-results"
        aria-expanded={showResults}
        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #1d4263", background: "#0a1a28", color: "#d1e4f0", fontSize: "0.85rem" }}
      />
      {loading && <span className="place-search-spinner" style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)" }}>⟳</span>}
      {showResults && results.length > 0 && (
        <div ref={resultsRef} id="place-results" role="listbox" className="place-results" style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px",
          background: "#0b1d2e", border: "1px solid #1d4263", borderRadius: "8px",
          maxHeight: "240px", overflow: "auto", zIndex: 1000, boxShadow: "0 8px 24px rgba(0,0,0,.35)"
        }}>
          {results.map((place) => (
            <button
              key={`${place.name}-${place.lat}-${place.lon}`}
              role="option"
              onClick={() => handleSelect(place)}
              style={{
                display: "flex", alignItems: "center", gap: "10px", width: "100%",
                padding: "10px 12px", textAlign: "left", background: "transparent",
                border: "none", color: "#d1e4f0", fontSize: "0.85rem", cursor: "pointer",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#12304a"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: "1rem" }}>{place.type === "city" ? "🏙" : "🏘"}</span>
              <span>{place.name}</span>
              <small style={{ color: "#9cbacf", marginLeft: "auto" }}>{place.lat.toFixed(3)}, {place.lon.toFixed(3)}</small>
            </button>
          ))}
        </div>
      )}
      {showResults && results.length === 0 && query.trim() && (
        <div id="place-results" className="place-results" style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px",
          background: "#0b1d2e", border: "1px solid #1d4263", borderRadius: "8px",
          padding: "12px", color: "#9cbacf", fontSize: "0.8rem"
        }}>
          Aucun lieu trouvé pour « {query} »
        </div>
      )}
    </div>
  );
}