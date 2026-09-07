"use client";

import { tileUrl, type MapData } from "./overview-dashboard";

/**
 * A larger static map view for one domain — the same detail_v2 tiles as the
 * inline card crop, zoomed out a little for context (matches genshintrack's
 * "expand to a bigger picture" affordance; no interactive map library).
 */

// N-level for the expanded view (higher = more context) and display px per tile.
const EXPAND_LEVEL = 1;
const EXPAND_TILE = 256;
// Half-extent of the tile mosaic; generous so it covers the modal at any size.
const HALF_COLS = 4;
const HALF_ROWS = 3;

export function DomainMapModal({
  mapData,
  region,
  location,
  onClose,
}: {
  mapData: MapData;
  region: string;
  location: string;
  onClose: () => void;
}) {
  const entry = mapData.regions[region];
  const factor = 2 ** EXPAND_LEVEL;
  const px = entry ? (mapData.origin[0] + entry.gx) / factor : 0;
  const py = entry ? (mapData.origin[1] + entry.gy) / factor : 0;
  const centerCol = Math.floor(px / EXPAND_TILE);
  const centerRow = Math.floor(py / EXPAND_TILE);

  const tiles: React.ReactElement[] = [];
  if (entry) {
    for (let row = centerRow - HALF_ROWS; row <= centerRow + HALF_ROWS; row += 1) {
      for (let col = centerCol - HALF_COLS; col <= centerCol + HALF_COLS; col += 1) {
        if (row < 0 || col < 0) continue;
        tiles.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${row}-${col}`}
            className="domain-map"
            src={tileUrl(mapData, col, row, EXPAND_LEVEL)}
            alt=""
            aria-hidden="true"
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
            style={{
              width: EXPAND_TILE,
              height: EXPAND_TILE,
              left: `calc(50% + ${Math.round(col * EXPAND_TILE - px)}px)`,
              top: `calc(50% + ${Math.round(row * EXPAND_TILE - py)}px)`,
            }}
          />,
        );
      }
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="map-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${location} map`}
      >
        <button
          className="modal-close over-banner"
          onClick={onClose}
          aria-label="Close map"
        >
          ×
        </button>
        {entry ? (
          <div className="map-canvas">
            {tiles}
            <span className="map-modal-pin" aria-hidden="true" />
            <div className="map-modal-caption">
              <span className="eyebrow coral-text">{region.toUpperCase()}</span>
              <h2>{location}</h2>
            </div>
          </div>
        ) : (
          <p className="roster-note modal-pad">
            No map location available for this domain.
          </p>
        )}
      </section>
    </div>
  );
}
