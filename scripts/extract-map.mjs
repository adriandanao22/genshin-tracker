/**
 * Fetch HoYoLab's Teyvat map metadata and compute a per-region map crop for
 * the Overview's domain cards. Writes public/gamedata/map.json. Re-run when a
 * new region ships (add its area_id below). See genshin-tracker-followups memory.
 *
 *   npm run extract-map
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CDN = "https://sg-public-api-static.hoyolab.com/common/map_user/ys_obc";
const QUERY = "map_id=2&app_sn=ys_obc&lang=en-us";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://act.hoyolab.com/ys/app/interactive-map/index.html",
};

// area_id (from map_anchor/list) → genshin-db region name.
const AREA_REGION = {
  1: "Mondstadt",
  2: "Liyue",
  3: "Inazuma",
  4: "Sumeru",
  8: "Fontaine",
  11: "Natlan",
  13: "Nod-Krai",
  16: "Snezhnaya",
};

// The domain-cluster median lands on the talent domain for the older regions,
// but drifts for Natlan/Nod-Krai (their domains are spread out). These exact
// talent-domain game coordinates were identified by matching the map tiles
// against genshintrack.com's domain reference images (Blazing Ruins,
// Lightless Capital) — see genshin-tracker-followups memory.
const TALENT_DOMAIN_OVERRIDE = {
  Natlan: [-8544, 4188], // Blazing Ruins
  "Nod-Krai": [-10718, 497], // Lightless Capital
};

async function getJson(endpoint) {
  const response = await fetch(`${CDN}/${endpoint}?${QUERY}`, {
    headers: HEADERS,
  });
  const body = await response.json();
  if (body.retcode !== 0)
    throw new Error(`${endpoint} → retcode ${body.retcode} (${body.message})`);
  return body.data;
}

const info = await getJson("v3/map/info");
// detail_v2 = the CURRENT map (a zoom-tile pyramid), unlike the legacy `detail`
// pre-stitched image which is frozen at 2024 and misses new regions.
const d2 = info.info.detail_v2;
const [originX, originY] = d2.origin;
const mapVersion = d2.map_version;
const TILE = 256;
// Tiles: map_manage/map/<mapId>/<version>/<x>_<y>_N<n>.webp — n is the zoom
// level; higher n = more zoomed out. Native pixel = origin + game_coord;
// at level n the pixel is divided by 2^n.
const tileUrlTemplate = `https://act-webstatic.hoyoverse.com/map_manage/map/2/${mapVersion}/{x}_{y}_N{n}.webp`;

// Center each region on where its DOMAINS actually cluster (label_id 154);
// median is robust to far-flung outlier domains. Coords are absolute game
// coordinates, independent of which map image/version we render.
const DOMAIN_LABEL = 154;
const points = (await getJson("v1/map/point/list")).point_list;
const coordsByRegion = {};
for (const point of points) {
  if (point.label_id !== DOMAIN_LABEL) continue;
  const region = AREA_REGION[point.area_id];
  if (!region) continue;
  (coordsByRegion[region] ??= []).push([point.x_pos, point.y_pos]);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Fallback: anchor bounding-box center for any region without domain points.
const anchors = (await getJson("v1/map/map_anchor/list")).list;
const bounds = {};
for (const anchor of anchors) {
  const region = AREA_REGION[anchor.area_id];
  if (!region) continue;
  const box = bounds[region] ?? {
    minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
  };
  box.minX = Math.min(box.minX, anchor.l_x, anchor.r_x);
  box.maxX = Math.max(box.maxX, anchor.l_x, anchor.r_x);
  box.minY = Math.min(box.minY, anchor.l_y, anchor.r_y);
  box.maxY = Math.max(box.maxY, anchor.l_y, anchor.r_y);
  bounds[region] = box;
}

const regions = {};
for (const region of Object.values(AREA_REGION)) {
  const override = TALENT_DOMAIN_OVERRIDE[region];
  const coords = coordsByRegion[region];
  let gx;
  let gy;
  if (override) {
    [gx, gy] = override;
  } else if (coords && coords.length >= 3) {
    gx = median(coords.map((c) => c[0]));
    gy = median(coords.map((c) => c[1]));
  } else if (bounds[region]) {
    gx = (bounds[region].minX + bounds[region].maxX) / 2;
    gy = (bounds[region].minY + bounds[region].maxY) / 2;
  } else {
    continue;
  }
  // Store game coords; the client maps them to tiles at its chosen zoom level.
  regions[region] = {
    gx: Math.round(gx),
    gy: Math.round(gy),
    domainCount: coords?.length ?? 0,
  };
}

const out = {
  fetchedAt: new Date().toISOString(),
  mapId: 2,
  mapVersion,
  tileUrlTemplate,
  tileSize: TILE,
  origin: [originX, originY],
  // Available zoom levels (N): 1 = most detailed served, 3 = most zoomed out.
  minLevel: 1,
  maxLevel: 3,
  regions,
};
const outFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "gamedata",
  "map.json",
);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(out));
console.log(
  `Wrote ${Object.keys(regions).length} regions to ${outFile}`,
  Object.keys(regions),
);
