"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { findGuide } from "@/lib/build-guides";
import {
  buildFarmingPlan,
  DEFAULT_TARGETS,
  findFarmingCharacter,
  formatCount,
  iconUrl,
  monsterIconUrl,
  loadFarmingData,
  serverWeekday,
  type CharacterPlan,
  type FarmingData,
  type PlanEntry,
  type RemainingItem,
} from "@/lib/farming";
import type { CharacterDetail, RosterCharacter } from "@/lib/hoyolab-game-record";
import { loadPlan } from "@/lib/plans";
import { elementTone } from "./character-detail-modal";

// Leaflet is client-only and loaded on demand when the map modal opens.
const DomainMapModal = dynamic(
  () => import("./domain-map-modal").then((m) => m.DomainMapModal),
  { ssr: false },
);

const DAY_CHIPS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const ELEMENTS = [
  "All",
  "Pyro",
  "Hydro",
  "Electro",
  "Cryo",
  "Anemo",
  "Geo",
  "Dendro",
];

function targetsFor(uid: string, character: RosterCharacter) {
  const plan = loadPlan(uid, character.id);
  const guide = findGuide(character.name);
  const base = guide
    ? { level: guide.recommendedLevel, ...guide.talentTargets }
    : DEFAULT_TARGETS;
  return {
    level: plan?.level ?? base.level,
    normal: plan?.normal ?? base.normal,
    skill: plan?.skill ?? base.skill,
    burst: plan?.burst ?? base.burst,
  };
}

function MaterialTile({ item }: { item: RemainingItem }) {
  const url = iconUrl(item.icon);
  return (
    <span className={`mat-tile ${item.kind}`} title={item.name}>
      {url ? (
        <Image src={url} alt={item.name} width={40} height={40} />
      ) : (
        <span className="mat-fallback">{item.name.slice(0, 2)}</span>
      )}
      <span className="mat-qty">{formatCount(item.count)}</span>
    </span>
  );
}

function ProgressBar({
  label,
  current,
  target,
}: {
  label: string;
  current: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="talent-progress">
      <span className="talent-progress-label">{label}</span>
      <span className="talent-progress-track">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="talent-progress-num">
        {current}
        <i>→{target}</i>
      </span>
    </div>
  );
}

export type MapData = {
  mapVersion: string;
  tileUrlTemplate: string;
  tileSize: number;
  origin: [number, number];
  minLevel: number;
  maxLevel: number;
  regions: Record<string, { gx: number; gy: number }>;
};

// Inline-crop zoom: N-level (1 = most detailed served) and display px per tile.
const CROP_LEVEL = 1;
const CROP_TILE_DISPLAY = 236;

export function tileUrl(mapData: MapData, x: number, y: number, n: number) {
  return mapData.tileUrlTemplate
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{n}", String(n));
}

/** A current-map crop centered on a region, from the detail_v2 tile pyramid. */
function DomainMap({ mapData, region }: { mapData: MapData; region: string }) {
  const entry = mapData.regions[region];
  if (!entry) return null;
  const tile = mapData.tileSize;
  const scale = CROP_TILE_DISPLAY / tile;
  const factor = 2 ** CROP_LEVEL;
  // Pixel of the region center at this zoom level (native pixel = origin + game).
  const px = (mapData.origin[0] + entry.gx) / factor;
  const py = (mapData.origin[1] + entry.gy) / factor;
  const centerCol = Math.floor(px / tile);
  const centerRow = Math.floor(py / tile);
  const tiles: React.ReactElement[] = [];
  for (let row = centerRow - 1; row <= centerRow + 1; row += 1) {
    for (let col = centerCol - 1; col <= centerCol + 1; col += 1) {
      if (row < 0 || col < 0) continue;
      const offsetX = Math.round((col * tile - px) * scale);
      const offsetY = Math.round((row * tile - py) * scale);
      tiles.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${row}-${col}`}
          className="domain-map"
          src={tileUrl(mapData, col, row, CROP_LEVEL)}
          alt=""
          aria-hidden="true"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
          style={{
            width: CROP_TILE_DISPLAY,
            height: CROP_TILE_DISPLAY,
            left: `calc(50% + ${offsetX}px)`,
            top: `calc(50% + ${offsetY}px)`,
          }}
        />,
      );
    }
  }
  return (
    <>
      {tiles}
      <span className="domain-map-pin" aria-hidden="true" />
    </>
  );
}

export function OverviewDashboard({
  uid,
  playerName,
  server,
  roster,
  connected,
  priorityIds,
  plansVersion,
  onOpen,
  onManagePriority,
  onConnect,
}: {
  uid: string;
  playerName: string;
  server: string;
  roster: RosterCharacter[] | null;
  connected: boolean;
  priorityIds: number[];
  plansVersion: number;
  onOpen: (characterId: number) => void;
  onManagePriority: () => void;
  onConnect: () => void;
}) {
  const [data, setData] = useState<FarmingData | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [details, setDetails] = useState<Record<number, CharacterDetail>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [elementFilter, setElementFilter] = useState("All");
  const [formableOnly, setFormableOnly] = useState(false);
  const [mapModal, setMapModal] = useState<{
    region: string;
    location: string;
  } | null>(null);

  const today = serverWeekday(server);
  const day = selectedDay ?? today;

  useEffect(() => {
    let cancelled = false;
    loadFarmingData().then((loaded) => {
      if (!cancelled) setData(loaded);
    });
    fetch("/gamedata/map.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((loaded) => {
        if (!cancelled) setMapData(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch full detail (current level + talents) for each priority character.
  useEffect(() => {
    if (!connected || priorityIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      priorityIds.map((id) =>
        fetch(`/api/hoyolab/roster/${id}`)
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => body?.character as CharacterDetail | undefined)
          .catch(() => undefined),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<number, CharacterDetail> = {};
      for (const character of results) if (character) next[character.id] = character;
      setDetails(next);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, priorityIds]);

  const plan = useMemo(() => {
    if (!data || !roster) return null;
    const prioritySet = new Set(priorityIds);
    const entries: PlanEntry[] = [];
    for (const character of roster) {
      if (!prioritySet.has(character.id)) continue;
      const farming = findFarmingCharacter(data, character.name);
      if (!farming) continue;
      const detail = details[character.id];
      const combat = detail?.talents.filter((t) => t.type === 1) ?? [];
      entries.push({
        id: character.id,
        name: character.name,
        icon: character.icon,
        element: character.element,
        farming,
        currentLevel: detail?.level ?? character.level,
        currentTalents: {
          normal: combat[0]?.level ?? 1,
          skill: combat[1]?.level ?? 1,
          burst: combat[2]?.level ?? 1,
        },
        targets: targetsFor(uid, character),
      });
    }
    return buildFarmingPlan(entries, data.materials, day, today);
    // plansVersion re-reads saved plans (targetsFor) after the modal closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, roster, priorityIds, details, uid, day, today, plansVersion]);

  const visibleCharacters = useMemo(() => {
    if (!plan) return [];
    return plan.characters.filter((character) => {
      if (elementFilter !== "All" && character.element !== elementFilter)
        return false;
      if (formableOnly && !character.formableToday) return false;
      return true;
    });
  }, [plan, elementFilter, formableOnly]);

  // buildFarmingPlan already filters domains to the selected day.
  const todaysDomains = plan?.domains ?? [];

  const moraIcon = data ? iconUrl(data.materials["Mora"]?.icon) : null;

  /* ---- Empty / disconnected states ---- */
  if (!connected) {
    return (
      <section className="panel dash-empty">
        <span className="eyebrow coral-text">WELCOME</span>
        <h2>Your farming plan, in focus.</h2>
        <p className="roster-note">
          Connect HoYoLAB, then star the characters you&apos;re building. This
          page becomes your daily plan: what to farm today, where, and how much.
        </p>
        <button className="primary-button" onClick={onConnect}>
          Connect HoYoLAB <span>→</span>
        </button>
      </section>
    );
  }

  if (priorityIds.length === 0) {
    return (
      <section className="panel dash-empty">
        <span className="eyebrow coral-text">
          WELCOME BACK, {playerName.toUpperCase()}
        </span>
        <h2>
          {day} on the {server} server
        </h2>
        <p className="roster-note">
          Star the characters you want to build in My Roster — your farming plan
          for them shows up here.
        </p>
        <button className="primary-button" onClick={onManagePriority}>
          Pick characters to build <span>→</span>
        </button>
      </section>
    );
  }

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <span className="eyebrow coral-text">
            WELCOME BACK, {playerName.toUpperCase()}
          </span>
          <h1>
            <b>{day}</b> on the {server} server
          </h1>
          <p className="dash-sub">
            Farming plan for {priorityIds.length} tracked character
            {priorityIds.length > 1 ? "s" : ""}. Priorities are set in My Roster.
          </p>
          <button className="pill-button" onClick={onManagePriority}>
            ✎ Edit priority
          </button>
        </div>
        <div className="mora-total">
          <span className="eyebrow">TOTAL MORA NEEDED</span>
          <strong>
            {moraIcon && (
              <Image src={moraIcon} alt="Mora" width={22} height={22} />
            )}
            {plan ? plan.totalMora.toLocaleString() : "—"}
          </strong>
        </div>
      </header>

      {/* Today's Domains */}
      <section className="dash-section">
        <div className="dash-section-head">
          <h3>
            Today&apos;s Domains{" "}
            <span className="count-badge">{todaysDomains.length}</span>
          </h3>
        </div>
        <div className="day-chips dash-days">
          {DAY_CHIPS.map((full) => (
            <button
              key={full}
              className={`day-chip ${day === full ? "day-active" : ""}`}
              onClick={() => setSelectedDay(full)}
            >
              {full.slice(0, 3)}
            </button>
          ))}
        </div>
        {todaysDomains.length === 0 ? (
          <p className="roster-note">
            No talent books for your tracked characters drop on {day}.
          </p>
        ) : (
          <div className="domain-grid">
            {todaysDomains.map((domain) => (
              <div className="domain-card" key={domain.location}>
                <div
                  className="domain-banner"
                  data-region={domain.region ?? ""}
                >
                  {domain.region && mapData?.regions[domain.region] && (
                    <DomainMap mapData={mapData} region={domain.region} />
                  )}
                  {domain.region && (
                    <span className="domain-region">{domain.region}</span>
                  )}
                  {domain.region && mapData?.regions[domain.region] && (
                    <button
                      className="domain-expand"
                      onClick={() =>
                        setMapModal({
                          region: domain.region as string,
                          location: domain.location,
                        })
                      }
                      aria-label={`Expand ${domain.location} map`}
                      title="Expand map"
                    >
                      ⤢
                    </button>
                  )}
                </div>
                <div className="domain-body">
                  <div className="domain-copy">
                    <b>{domain.location}</b>
                    <small>{domain.series.map((s) => s.name).join(" · ")}</small>
                  </div>
                  {domain.series.map((series) => (
                    <div className="series-row" key={series.name}>
                      <span className="series-name">{series.name}</span>
                      <span className="series-tiles">
                        {series.items.map((item) => (
                          <span
                            className="mat-tile book"
                            key={item.name}
                            title={`${item.name} ×${item.count}`}
                          >
                            {item.icon && (
                              <Image
                                src={iconUrl(item.icon) as string}
                                alt={item.name}
                                width={40}
                                height={40}
                              />
                            )}
                            <span className="mat-qty">
                              {formatCount(item.count)}
                            </span>
                          </span>
                        ))}
                      </span>
                      <span className="contributors">
                        {series.contributors.map((contributor) => (
                          <span
                            className="contributor-avatar"
                            key={contributor.name}
                            title={`${contributor.name} · ${formatCount(contributor.count)} books`}
                          >
                            {contributor.icon ? (
                              <Image
                                src={contributor.icon}
                                alt={contributor.name}
                                width={26}
                                height={26}
                              />
                            ) : (
                              contributor.name.slice(0, 1)
                            )}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Weekly Bosses */}
      <section className="dash-section">
        <div className="dash-section-head">
          <h3>
            Weekly Bosses{" "}
            <span className="count-badge">
              {plan ? plan.weeklyBosses.length : 0}
            </span>
          </h3>
        </div>
        {plan && plan.weeklyBosses.length === 0 ? (
          <p className="roster-note">No weekly boss materials still needed.</p>
        ) : (
          <div className="boss-grid">
            {plan?.weeklyBosses.map((boss) => (
              <div className="boss-card" key={boss.boss}>
                <div className="boss-portrait">
                  {boss.bossIcon ? (
                    <Image
                      src={monsterIconUrl(boss.bossIcon) as string}
                      alt={boss.boss}
                      width={96}
                      height={96}
                    />
                  ) : (
                    <span className="boss-portrait-fallback">
                      {boss.boss.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="boss-body">
                  <div className="domain-copy">
                    <b>{boss.boss}</b>
                    <small>{boss.material}</small>
                  </div>
                  <div className="source-line">
                    <span className="mat-tile weekly">
                      {boss.icon && (
                        <Image
                          src={iconUrl(boss.icon) as string}
                          alt={boss.material}
                          width={40}
                          height={40}
                        />
                      )}
                      <span className="mat-qty">{formatCount(boss.total)}</span>
                    </span>
                    <span className="contributors">
                      {boss.contributors.map((contributor) => (
                        <span
                          className="contributor-avatar"
                          key={contributor.name}
                          title={`${contributor.name} · ${formatCount(contributor.count)}`}
                        >
                          {contributor.icon ? (
                            <Image
                              src={contributor.icon}
                              alt={contributor.name}
                              width={26}
                              height={26}
                            />
                          ) : (
                            contributor.name.slice(0, 1)
                          )}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* By Character */}
      <section className="dash-section">
        <div className="dash-section-head">
          <h3>
            By Character{" "}
            <span className="count-badge">
              {plan ? plan.characters.length : 0}
            </span>
          </h3>
          <div className="filter-tabs">
            {ELEMENTS.map((element) => (
              <button
                key={element}
                className={elementFilter === element ? "active-filter" : ""}
                onClick={() => setElementFilter(element)}
              >
                {element}
              </button>
            ))}
            <button
              className={formableOnly ? "active-filter" : ""}
              onClick={() => setFormableOnly((value) => !value)}
            >
              Formable today
            </button>
          </div>
        </div>
        {!plan && (
          <p className="roster-note">Building your plan from HoYoLAB...</p>
        )}
        {plan && visibleCharacters.length === 0 && (
          <p className="roster-note">No tracked characters match this filter.</p>
        )}
        <div className="char-plan-grid">
          {visibleCharacters.map((character) => (
            <CharacterPlanCard
              key={character.id}
              character={character}
              onOpen={() => onOpen(character.id)}
            />
          ))}
        </div>
      </section>

      {mapModal && mapData && (
        <DomainMapModal
          mapData={mapData}
          region={mapModal.region}
          location={mapModal.location}
          onClose={() => setMapModal(null)}
        />
      )}
    </div>
  );
}

function CharacterPlanCard({
  character,
  onOpen,
}: {
  character: CharacterPlan;
  onOpen: () => void;
}) {
  const done = character.remaining.length === 0;
  return (
    <div
      className="char-plan-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="char-plan-head">
        <span
          className={`character-avatar ${elementTone[character.element] ?? "gold"}`}
        >
          {character.icon ? (
            <Image
              src={character.icon}
              alt={character.name}
              width={44}
              height={44}
            />
          ) : (
            character.name.slice(0, 2).toUpperCase()
          )}
        </span>
        <div className="char-plan-title">
          <b>{character.name}</b>
          <small>
            Lv {character.currentLevel} → {character.targets.level}
          </small>
        </div>
        {character.formableToday && (
          <span className="today-badge">Farm today</span>
        )}
      </div>
      <div className="char-plan-talents">
        <ProgressBar
          label="Skill"
          current={character.currentTalents.skill}
          target={character.targets.skill}
        />
        <ProgressBar
          label="Burst"
          current={character.currentTalents.burst}
          target={character.targets.burst}
        />
      </div>
      {done ? (
        <p className="roster-note char-plan-done">✓ Targets reached</p>
      ) : (
        <div className="mat-tiles">
          {character.remaining.map((item) => (
            <MaterialTile item={item} key={item.name} />
          ))}
        </div>
      )}
    </div>
  );
}
