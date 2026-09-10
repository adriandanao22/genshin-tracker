"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { findGuide, type BuildGuide, type GuideWeapon } from "@/lib/build-guides";
import { consensusToGuide } from "@/lib/hoyolab-lineup";
import {
  getBundledConsensusByName,
  hasCommunityGuideByName,
} from "@/lib/consensus-data";
import {
  iconUrl,
  loadCharacterGuides,
  normalizeName,
  type CharacterGuide,
  type CharacterGuideData,
} from "@/lib/character-guides";
import {
  findFarmingCharacter,
  iconUrl as farmIconUrl,
  loadFarmingData,
  type FarmingCharacter,
  type FarmingData,
} from "@/lib/farming";
import type { RosterCharacter } from "@/lib/hoyolab-game-record";
import { elementTone } from "./character-detail-modal";

const ELEMENTS = [
  "Pyro",
  "Hydro",
  "Anemo",
  "Electro",
  "Dendro",
  "Cryo",
  "Geo",
];

const SLOT_LABEL: Record<string, string> = {
  normal: "Normal Attack",
  skill: "Elemental Skill",
  burst: "Elemental Burst",
};

function Stars({ rarity }: { rarity: number }) {
  return (
    <span className={`stars rarity-${rarity}`} aria-label={`${rarity} star`}>
      {"★".repeat(rarity)}
    </span>
  );
}

function WeaponRow({ weapon }: { weapon: GuideWeapon }) {
  return (
    <div className="gw-weapon">
      <span className={`gw-tier tier-${weapon.tier.toLowerCase()}`}>
        {weapon.tier}
      </span>
      <span className="gw-weapon-name">
        {weapon.name}
        {weapon.refinement ? <i> · R{weapon.refinement}</i> : null}
      </span>
      <span className="gw-weapon-meta">
        {weapon.stat}
        {weapon.source ? ` · ${weapon.source}` : ""}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail view                                                         */
/* ------------------------------------------------------------------ */

function GuideDetail({
  guide,
  build,
  farming,
  materials,
  owned,
  connected,
  onBack,
  onOpen,
}: {
  guide: CharacterGuide;
  build: BuildGuide | null;
  farming: FarmingCharacter | null;
  materials: FarmingData["materials"] | null;
  owned: RosterCharacter | undefined;
  connected: boolean;
  onBack: () => void;
  onOpen: (id: number) => void;
}) {
  const tone = elementTone[guide.element] ?? "lavender";
  const portrait = iconUrl(guide.portrait);

  const matChips = farming
    ? [
        { label: "Gem", name: farming.gem ? `${farming.gem} Gemstone` : null },
        { label: "Boss drop", name: farming.boss },
        { label: "Local specialty", name: farming.specialty },
        { label: "Common", name: farming.common },
        { label: "Talent book", name: farming.book },
        { label: "Weekly boss", name: farming.weekly },
      ].filter((m) => m.name)
    : [];

  return (
    <div className="guide-detail" data-tone={tone}>
      <button className="ghost-button guide-back" onClick={onBack}>
        ← All characters
      </button>

      <header
        className="guide-hero"
        style={
          portrait
            ? { backgroundImage: `url(${portrait})` }
            : undefined
        }
      >
        <div className="guide-hero-shade" />
        <div className="guide-hero-info">
          <Stars rarity={guide.rarity} />
          <h2>{guide.name}</h2>
          <div className="guide-hero-tags">
            <span className={`chip tone-${tone}`}>{guide.element}</span>
            {guide.weaponType && <span className="chip">{guide.weaponType}</span>}
            {guide.region && <span className="chip">{guide.region}</span>}
          </div>
          {build && <p className="guide-hero-role">{build.role}</p>}
          {owned && (
            <button
              className="primary-button guide-hero-cta"
              onClick={() => onOpen(owned.id)}
            >
              Grade my build <span>→</span>
            </button>
          )}
          {!owned && connected && (
            <span className="guide-hero-note">Not in your roster</span>
          )}
        </div>
      </header>

      <div className="guide-detail-grid">
        {/* Recommended build (authored opinions) */}
        <section className="guide-section">
          <span className="build-label">RECOMMENDED BUILD</span>
          {build ? (
            <div className="gw-build">
              <div className="gw-block">
                <i className="gw-block-title">Weapons</i>
                {build.weapons.map((weapon) => (
                  <WeaponRow key={weapon.name} weapon={weapon} />
                ))}
              </div>
              <div className="gw-block">
                <i className="gw-block-title">Artifacts</i>
                {build.artifactSets.map((set) => (
                  <div className="gw-line" key={set.name}>
                    <b>{set.pieces}pc {set.name}</b>
                    {set.recommended && <span className="gw-rec">Best</span>}
                  </div>
                ))}
                <div className="gw-mainstats">
                  <span>
                    <i>Sands</i> {build.mainStats.sands.join(" / ") || "—"}
                  </span>
                  <span>
                    <i>Goblet</i> {build.mainStats.goblet.join(" / ") || "—"}
                  </span>
                  <span>
                    <i>Circlet</i> {build.mainStats.circlet.join(" / ") || "—"}
                  </span>
                  <span>
                    <i>Substats</i> {build.substatPriority.join(" > ")}
                  </span>
                </div>
              </div>
              <div className="gw-block">
                <i className="gw-block-title">Talent priority</i>
                <div className="gw-line">
                  <b>
                    {build.talentTargets.skill >= build.talentTargets.burst
                      ? "Skill "
                      : "Burst "}
                    first
                  </b>
                  <span className="gw-talent-nums">
                    N{build.talentTargets.normal} · S{build.talentTargets.skill}{" "}
                    · B{build.talentTargets.burst}
                  </span>
                </div>
                {build.talentNote && (
                  <p className="gw-note">{build.talentNote}</p>
                )}
              </div>
              {build.statTargets.length > 0 && (
                <div className="gw-block">
                  <i className="gw-block-title">Stat goals</i>
                  {build.statTargets.map((target) => (
                    <div className="gw-line" key={target.stat}>
                      <b>{target.stat}</b>
                      <span className="gw-talent-nums">
                        {target.min.toLocaleString()}
                        {target.note ? ` · ${target.note}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="roster-note">
              No opinionated build authored for {guide.name} yet — the official
              skill and constellation data is below.
              {owned
                ? " Open the character from My Roster to grade your live build against community consensus."
                : ""}
            </p>
          )}

          {matChips.length > 0 && (
            <div className="gw-materials">
              <i className="gw-block-title">Ascension materials</i>
              <div className="gw-mat-chips">
                {matChips.map((mat) => {
                  const icon = materials?.[mat.name as string]?.icon;
                  return (
                    <span className="gw-mat" key={mat.label} title={mat.label}>
                      {icon && (
                        <Image
                          src={farmIconUrl(icon) as string}
                          alt={mat.name as string}
                          width={26}
                          height={26}
                        />
                      )}
                      {mat.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Skills */}
        <section className="guide-section">
          <span className="build-label">SKILLS</span>
          <div className="gw-skills">
            {guide.skills.map((s) => (
              <details className="gw-skill" key={s.slot} open>
                <summary>
                  <span className="gw-skill-slot">
                    {SLOT_LABEL[s.slot] ?? "Passive"}
                  </span>
                  <b>{s.name}</b>
                </summary>
                <p>{s.description}</p>
              </details>
            ))}
            {guide.passives.map((s) => (
              <details className="gw-skill passive" key={s.name}>
                <summary>
                  <span className="gw-skill-slot">Passive</span>
                  <b>{s.name}</b>
                </summary>
                <p>{s.description}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Constellations */}
        {guide.constellations.length > 0 && (
          <section className="guide-section">
            <span className="build-label">CONSTELLATIONS</span>
            <div className="gw-cons">
              {guide.constellations.map((c) => (
                <div className="gw-con" key={c.level}>
                  <span className="gw-con-badge">C{c.level}</span>
                  <div>
                    <b>{c.name}</b>
                    <p>{c.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page (directory + detail)                                           */
/* ------------------------------------------------------------------ */

export function BuildGuidesPage({
  roster,
  connected,
  priorityIds = [],
  onOpen,
}: {
  roster: RosterCharacter[] | null;
  connected: boolean;
  priorityIds?: number[];
  onOpen: (characterId: number) => void;
}) {
  const [data, setData] = useState<CharacterGuideData | null>(null);
  const [farmingData, setFarmingData] = useState<FarmingData | null>(null);
  const [search, setSearch] = useState("");
  const [element, setElement] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCharacterGuides().then((d) => !cancelled && setData(d));
    loadFarmingData().then((d) => !cancelled && setFarmingData(d));
    return () => {
      cancelled = true;
    };
  }, []);

  const ownedByName = useMemo(() => {
    const map = new Map<string, RosterCharacter>();
    for (const character of roster ?? [])
      map.set(normalizeName(character.name), character);
    return map;
  }, [roster]);

  const prioritySet = useMemo(() => new Set(priorityIds), [priorityIds]);

  const list = useMemo(() => {
    if (!data) return [];
    const query = normalizeName(search);
    return Object.values(data.characters)
      .filter((c) => {
        if (element && c.element !== element) return false;
        if (ownedOnly && !ownedByName.has(normalizeName(c.name))) return false;
        if (query && !normalizeName(c.name).includes(query)) return false;
        return true;
      })
      .sort(
        (a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name),
      );
  }, [data, search, element, ownedOnly, ownedByName]);

  const selectedGuide = selected ? data?.characters[selected] ?? null : null;

  if (selectedGuide) {
    const community = getBundledConsensusByName(selectedGuide.name);
    const build =
      findGuide(selectedGuide.name) ??
      (community ? consensusToGuide(community) : null);
    const farming = farmingData
      ? findFarmingCharacter(farmingData, selectedGuide.name)
      : null;
    return (
      <section className="guides-page panel">
        <GuideDetail
          guide={selectedGuide}
          build={build}
          farming={farming}
          materials={farmingData?.materials ?? null}
          owned={ownedByName.get(normalizeName(selectedGuide.name))}
          connected={connected}
          onBack={() => setSelected(null)}
          onOpen={onOpen}
        />
      </section>
    );
  }

  return (
    <section className="guides-page panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            BUILD GUIDES · {data ? list.length : "…"} CHARACTERS
          </span>
          <h3>Weapons, artifacts, skills & constellations</h3>
        </div>
      </div>

      <div className="guide-filters">
        <input
          className="guide-search"
          placeholder="Search characters…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="element-chips">
          {ELEMENTS.map((el) => (
            <button
              key={el}
              className={`element-chip tone-${elementTone[el] ?? "lavender"} ${
                element === el ? "is-active" : ""
              }`}
              onClick={() => setElement(element === el ? "" : el)}
            >
              {el}
            </button>
          ))}
        </div>
        <label className="owned-toggle">
          <input
            type="checkbox"
            checked={ownedOnly}
            onChange={(event) => setOwnedOnly(event.target.checked)}
          />
          Owned only
        </label>
      </div>

      {!data && <p className="roster-note">Loading character data…</p>}

      <div className="guide-grid">
        {list.map((c) => {
          const key = normalizeName(c.name);
          const ownedCharacter = ownedByName.get(key);
          const isPriority =
            ownedCharacter && prioritySet.has(ownedCharacter.id);
          const hasBuild =
            findGuide(c.name) !== null || hasCommunityGuideByName(c.name);
          const icon = iconUrl(c.icon);
          return (
            <button
              className={`guide-tile tone-${elementTone[c.element] ?? "lavender"}`}
              key={key}
              onClick={() => setSelected(key)}
            >
              <span className="guide-tile-art">
                {icon && (
                  <Image src={icon} alt={c.name} width={64} height={64} />
                )}
                {ownedCharacter && (
                  <i className="guide-tile-owned" title="In your roster">
                    ✓
                  </i>
                )}
                {isPriority && (
                  <i className="guide-tile-star" title="Priority">
                    ★
                  </i>
                )}
              </span>
              <b>{c.name}</b>
              <Stars rarity={c.rarity} />
              <div className="guide-tile-tags">
                <span>{c.element}</span>
                {hasBuild && <span className="guide-tile-hasbuild">Guide</span>}
              </div>
            </button>
          );
        })}
      </div>

      {data && list.length === 0 && (
        <p className="roster-note">No characters match those filters.</p>
      )}
    </section>
  );
}
