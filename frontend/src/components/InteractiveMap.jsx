import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchGeocodeSuggestions } from "../api/query.js";
import "./InteractiveMap.css";

function syncUrlParams(lat, lon, name) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (lat != null && lon != null && !isNaN(Number(lat)) && !isNaN(Number(lon))) {
      url.searchParams.set("lat", Number(lat).toFixed(4));
      url.searchParams.set("lon", Number(lon).toFixed(4));
    }
    if (name) {
      url.searchParams.set("loc", name);
    }
    window.history.replaceState({}, "", url.toString());
  } catch {
    // Non-critical URL sync exception
  }
}

const PRESET_LOCATIONS = [
  { name: "New Delhi", lat: 28.6139, lon: 77.2090, desc: "Capital urban core & Yamuna river" },
  { name: "Kedarnath", lat: 30.7346, lon: 79.0669, desc: "Himalayan disaster & flash flood monitoring" },
  { name: "Brahmaputra", lat: 26.1856, lon: 91.7539, desc: "Assam monsoon inundation & radar SAR" },
  { name: "Chilika Lake", lat: 19.7165, lon: 85.3214, desc: "Coastal wetland & brackish lagoon" },
  { name: "Suez Canal", lat: 30.5852, lon: 32.5658, desc: "Maritime navigation bottleneck" },
  { name: "Mumbai Port", lat: 18.9667, lon: 72.8258, desc: "Arabian Sea coastal development" },
];

const TILE_PROVIDERS = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
      maxZoom: 18,
    },
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    },
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    },
  },
};

function createRadarIcon() {
  return L.divIcon({
    className: "radar-pin-icon",
    html: `
      <div class="radar-reticle">
        <div class="radar-ping"></div>
        <div class="radar-center-dot"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function calculateFootprintBounds(lat, lon) {
  const latDelta = 0.012;
  const lonDelta = 0.012 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [
    [lat - latDelta, lon - lonDelta],
    [lat + latDelta, lon + lonDelta],
  ];
}

export default function InteractiveMap({
  latitude,
  longitude,
  locationName = "",
  onLocationSelect,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markerRef = useRef(null);
  const footprintRef = useRef(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  const locationNameRef = useRef(locationName);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
    locationNameRef.current = locationName;
  }, [onLocationSelect, locationName]);

  const [activeLayer, setActiveLayer] = useState("satellite");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(13);

  const searchContainerRef = useRef(null);

  const numLat = Number(latitude) || 28.6139;
  const numLon = Number(longitude) || 77.2090;

  const updateLocationTarget = useCallback(async (lat, lon, knownName = "") => {
    const formattedLat = parseFloat(lat.toFixed(4));
    const formattedLon = parseFloat(lon.toFixed(4));

    if (markerRef.current) {
      markerRef.current.setLatLng([formattedLat, formattedLon]);
    }
    if (footprintRef.current) {
      footprintRef.current.setBounds(calculateFootprintBounds(formattedLat, formattedLon));
    }

    let finalName = knownName;
    if (!finalName) {
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${formattedLat}&lon=${formattedLon}&zoom=12`
        );
        if (resp.ok) {
          const data = await resp.json();
          finalName =
            data.address?.city ||
            data.address?.town ||
            data.address?.county ||
            data.address?.state ||
            data.name ||
            "";
        }
      } catch {
        // Reverse geocoding error ignored
      }
    }

    const resolvedName = finalName || locationNameRef.current;
    syncUrlParams(formattedLat, formattedLon, resolvedName);

    if (onLocationSelectRef.current) {
      onLocationSelectRef.current({
        lat: formattedLat,
        lon: formattedLon,
        name: resolvedName,
      });
    }
  }, []);

  const updateTargetRef = useRef(updateLocationTarget);
  useEffect(() => {
    updateTargetRef.current = updateLocationTarget;
  }, [updateLocationTarget]);

  // Debounced location autocomplete lookup
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await fetchGeocodeSuggestions(trimmed);
        setSuggestions(results);
        setIsDropdownOpen(results && results.length > 0);
        setHighlightedIndex(-1);
      } catch {
        setSuggestions([]);
        setIsDropdownOpen(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Sync initial location from URL parameters if present
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const p = new URLSearchParams(window.location.search);
      const urlLat = parseFloat(p.get("lat"));
      const urlLon = parseFloat(p.get("lon") || p.get("lng"));
      const urlLoc = p.get("loc") || p.get("name") || "";
      if (!isNaN(urlLat) && !isNaN(urlLon) && urlLat >= -90 && urlLat <= 90 && urlLon >= -180 && urlLon <= 180) {
        updateLocationTarget(urlLat, urlLon, urlLoc);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo([urlLat, urlLon]);
        }
      }
    } catch {
      // URL sync error ignored
    }
  }, [updateLocationTarget]);

  // Initialize map instance ONCE on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    if (mapContainerRef.current._leaflet_id) {
      delete mapContainerRef.current._leaflet_id;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [numLat, numLon],
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
      });

      const tileConfig = TILE_PROVIDERS[activeLayer] || TILE_PROVIDERS.satellite;
      const tileLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);
      tileLayerRef.current = tileLayer;

      // Marker
      const marker = L.marker([numLat, numLon], {
        icon: createRadarIcon(),
        draggable: true,
      }).addTo(map);
      markerRef.current = marker;

      // Sentinel tile footprint rectangle
      const bounds = calculateFootprintBounds(numLat, numLon);
      const footprint = L.rectangle(bounds, {
        color: "#00e5ff",
        weight: 1.5,
        dashArray: "4, 4",
        fillColor: "#00bcd4",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
      footprintRef.current = footprint;

      // Click handler to set target
      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        if (updateTargetRef.current) {
          updateTargetRef.current(lat, lng);
        }
      });

      // Drag marker handler
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        if (updateTargetRef.current) {
          updateTargetRef.current(lat, lng);
        }
      });

      // Zoom level tracker
      map.on("zoomend", () => {
        setCurrentZoom(map.getZoom());
      });

      mapInstanceRef.current = map;

      const timer = setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      }, 150);

      return () => {
        clearTimeout(timer);
        try {
          map.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
      };
    } catch (err) {
      console.warn("Leaflet map initialization warning:", err);
    }
  }, []);

  // Update base tile layer
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const map = mapInstanceRef.current;
    map.removeLayer(tileLayerRef.current);

    const tileConfig = TILE_PROVIDERS[activeLayer];
    const nextLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);
    tileLayerRef.current = nextLayer;
  }, [activeLayer]);

  // Sync marker and footprint when external props change
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current) return;
    if (isNaN(numLat) || isNaN(numLon)) return;

    const currentPos = markerRef.current.getLatLng();
    if (
      Math.abs(currentPos.lat - numLat) > 0.0001 ||
      Math.abs(currentPos.lng - numLon) > 0.0001
    ) {
      markerRef.current.setLatLng([numLat, numLon]);
      if (footprintRef.current) {
        footprintRef.current.setBounds(calculateFootprintBounds(numLat, numLon));
      }
      mapInstanceRef.current.panTo([numLat, numLon]);
    }
  }, [numLat, numLon]);

  const handlePresetClick = (preset) => {
    setSearchQuery(preset.name);
    setIsDropdownOpen(false);
    updateLocationTarget(preset.lat, preset.lon, preset.name);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([preset.lat, preset.lon], 13, { duration: 1.2 });
    }
  };

  const handleSelectSuggestion = (item) => {
    setSearchQuery(item.name);
    setIsDropdownOpen(false);
    updateLocationTarget(item.lat, item.lon, item.name);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([item.lat, item.lon], 13, { duration: 1.2 });
    }
  };

  const handleKeyDown = (e) => {
    if (!isDropdownOpen || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleSearch(e);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[highlightedIndex]);
      } else {
        handleSearch(e);
      }
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
    }
  };

  const handleSearch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    setIsDropdownOpen(false);
    const q = searchQuery.trim();
    if (!q) return;

    // 1. Direct coordinates pattern check: "lat, lon" or "lat lon"
    const coordMatch = q.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        updateLocationTarget(lat, lon, `Coord (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([lat, lon], 13, { duration: 1.2 });
        }
        return;
      }
    }

    setIsSearching(true);
    try {
      // First try backend autocomplete for fast resolution
      const results = await fetchGeocodeSuggestions(q);
      if (results && results.length > 0) {
        const target = results[0];
        updateLocationTarget(target.lat, target.lon, target.name);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([target.lat, target.lon], 13, { duration: 1.5 });
        }
        return;
      }

      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        {
          headers: {
            "Accept-Language": "en",
          },
        }
      );
      if (resp.ok) {
        const nominatimResults = await resp.json();
        if (nominatimResults && nominatimResults.length > 0) {
          const target = nominatimResults[0];
          const lat = parseFloat(target.lat);
          const lon = parseFloat(target.lon);
          updateLocationTarget(lat, lon, target.display_name.split(",")[0]);
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([lat, lon], 13, { duration: 1.5 });
          }
        }
      }
    } catch {
      // Search error gracefully ignored
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="interactive-map-container">
      <div className="map-toolbar">
        <div className="map-presets">
          <span className="preset-label">SIH Presets:</span>
          {PRESET_LOCATIONS.map((preset) => {
            const isActive =
              Math.abs(numLat - preset.lat) < 0.01 &&
              Math.abs(numLon - preset.lon) < 0.01;
            return (
              <button
                key={preset.name}
                type="button"
                className={`preset-btn ${isActive ? "active" : ""}`}
                onClick={() => handlePresetClick(preset)}
                title={preset.desc}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        <div className="map-search-bar" ref={searchContainerRef}>
          <div className="map-search-input-wrapper">
            <input
              type="text"
              className="map-search-input"
              placeholder="Search place, city, or coordinates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setIsDropdownOpen(true);
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            {isDropdownOpen && suggestions.length > 0 && (
              <div className="map-autocomplete-dropdown" role="listbox">
                {suggestions.map((item, idx) => (
                  <div
                    key={`${item.lat}-${item.lon}-${idx}`}
                    className={`autocomplete-item ${highlightedIndex === idx ? "highlighted" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(item);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    role="option"
                    aria-selected={highlightedIndex === idx}
                  >
                    <div className="autocomplete-item-row">
                      <span className="autocomplete-name">{item.name}</span>
                      <span className="autocomplete-category">{item.category || "Place"}</span>
                    </div>
                    <div className="autocomplete-details">
                      <span className="autocomplete-coords">
                        {item.lat.toFixed(4)}°N, {item.lon.toFixed(4)}°E
                      </span>
                      {item.display_name && (
                        <span className="autocomplete-address" title={item.display_name}>
                          {item.display_name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="map-search-btn"
            disabled={isSearching}
            onClick={(e) => handleSearch(e)}
          >
            {isSearching ? "Locating..." : "Locate"}
          </button>
        </div>

        <div className="map-layer-controls">
          <button
            type="button"
            className={`layer-toggle-btn ${activeLayer === "satellite" ? "active" : ""}`}
            onClick={() => setActiveLayer("satellite")}
          >
            Satellite
          </button>
          <button
            type="button"
            className={`layer-toggle-btn ${activeLayer === "dark" ? "active" : ""}`}
            onClick={() => setActiveLayer("dark")}
          >
            Tactical
          </button>
          <button
            type="button"
            className={`layer-toggle-btn ${activeLayer === "street" ? "active" : ""}`}
            onClick={() => setActiveLayer("street")}
          >
            Street
          </button>
        </div>
      </div>

      <div className="leaflet-map-wrapper">
        <div ref={mapContainerRef} className="leaflet-map-element" />

        <div className="map-hint-overlay">
          Click map or drag pin to target Sentinel-2 scene
        </div>

        <div className="map-readout-overlay">
          <span className="map-readout-item">
            LAT: <strong>{numLat.toFixed(4)}&deg;</strong>
          </span>
          <span className="map-readout-item">
            LON: <strong>{numLon.toFixed(4)}&deg;</strong>
          </span>
          <span className="map-readout-item">
            ZOOM: <strong>{currentZoom}</strong>
          </span>
          {locationName && (
            <span className="map-readout-item">
              POI: <strong>{locationName}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
