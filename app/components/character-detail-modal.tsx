"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { findGuide, gradeBuild, type BuildGuide } from "@/lib/build-guides";
import {
  gradeArtifacts,
  gradeBuildOverall,
  artifactVerdict,
  type PieceGrade,
} from "@/lib/artifact-grade";
import {
  findFarmingCharacter,
  formatCount,
  iconUrl,
  loadFarmingData,
  remainingMaterials,
  weaponRemaining,
  DEFAULT_TARGETS,
  type FarmingData,
  type RemainingItem,
} from "@/lib/farming";
import type { CharacterDetail } from "@/lib/hoyolab-game-record";
import {
  consensusToGuide,
  type ConsensusBuild,
  type LineupSuggestion,
} from "@/lib/hoyolab-lineup";
import { domainForBook } from "@/lib/talent-domains";
import { clearPlan, loadPlan, savePlan, type BuildPlan } from "@/lib/plans";
import { syncPlans } from "@/lib/user-sync";
import { compArchetype, normalizeName } from "@/lib/character-guides";
import type { ActiveComp } from "@/lib/active-comp";
import {
  findSet,
  findWeapon,
  loadBuildAssets,
  setIconUrl,
  weaponIconUrl,
  type BuildAssets,
} from "@/lib/build-assets";

export const elementTone: Record<string, string> = {
  Pyro: "coral",
  Hydro: "blue",
  Anemo: "mint",
  Geo: "gold",
  Electro: "violet",
  Cryo: "ice",
  Dendro: "leaf",
};

const slotOrder = ["Flower", "Plume", "Sands", "Goblet", "Circlet"];
const LEVEL_STEPS = [1, 20, 40, 50, 60, 70, 80, 90];

const SANDS_STATS = ["ATK%", "HP%", "DEF%", "Elemental Mastery", "Energy Recharge"];
const GOBLET_STATS = [
  "Pyro DMG Bonus",
  "Hydro DMG Bonus",
  "Electro DMG Bonus",
  "Cryo DMG Bonus",
  "Anemo DMG Bonus",
  "Geo DMG Bonus",
  "Dendro DMG Bonus",
  "Physical DMG Bonus",
  "ATK%",
  "HP%",
  "DEF%",
  "Elemental Mastery",
];
const CIRCLET_STATS = [
  "CRIT Rate",
  "CRIT DMG",
  "ATK%",
  "HP%",
  "DEF%",
  "Elemental Mastery",
  "Healing Bonus",
];

function dedupe(values: Array<string | undefined | null>) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

/** − value + control over either an options list or a numeric range. */
function Stepper({
  value,
  onChange,
  options,
  min,
  max,
  format,
}: {
  value: number;
  onChange: (value: number) => void;
  options?: number[];
  min?: number;
  max?: number;
  format?: (value: number) => string;
}) {
  const list = options ?? [];
  const index = options ? options.indexOf(value) : 0;
  const canDown = options ? index > 0 : value > (min ?? 0);
  const canUp = options ? index < list.length - 1 : value < (max ?? 99);
  const step = (delta: number) => {
    if (options) {
      const next = list[index + delta];
      if (next !== undefined) onChange(next);
    } else {
      onChange(value + delta);
    }
  };
  return (
    <div className="stepper">
      <button
        type="button"
        disabled={!canDown}
        onClick={() => step(-1)}
        aria-label="Decrease"
      >
        −
      </button>
      <span>{format ? format(value) : value}</span>
      <button
        type="button"
        disabled={!canUp}
        onClick={() => step(1)}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

function Stars({ n }: { n: number | null | undefined }) {
  if (!n) return null;
  return <span className={`gp-stars r${n}`}>{"★".repeat(n)}</span>;
}

export type GearRow = {
  name: string;
  icon: string | null;
  rarity: number | null;
  sub: string | null;
  tier?: string | null;
  pct?: number | null;
  owned?: boolean;
  ownedNote?: string | null;
};

/** Image + rating dropdown for a weapon or artifact set. */
function GearPicker({
  value,
  rows,
  placeholder,
  onSelect,
  followItem = null,
}: {
  value: string;
  rows: GearRow[];
  placeholder: string;
  onSelect: (name: string) => void;
  followItem?: { name: string; icon: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = rows.find((row) => row.name === value) ?? null;
  const choose = (name: string) => {
    onSelect(name);
    setOpen(false);
  };
  return (
    <div className="gear-picker" ref={ref}>
      <button
        type="button"
        className="gear-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <>
            <span className="gear-ico">
              {selected.icon && (
                <Image src={selected.icon} alt="" width={30} height={30} />
              )}
            </span>
            <span className="gear-trigger-name">{selected.name}</span>
          </>
        ) : followItem ? (
          <>
            <span className="gear-ico">
              {followItem.icon && (
                <Image src={followItem.icon} alt="" width={30} height={30} />
              )}
            </span>
            <span className="gear-trigger-name">
              {placeholder} <i className="gear-follow-item">· {followItem.name}</i>
            </span>
          </>
        ) : (
          <span className="gear-trigger-name muted">{placeholder}</span>
        )}
        <span className="gear-caret">▾</span>
      </button>
      {open && (
        <div className="gear-menu" role="listbox">
          <button
            type="button"
            className={`gear-opt ${value === "" ? "sel" : ""}`}
            onClick={() => choose("")}
          >
            <span className="gear-ico">
              {followItem?.icon ? (
                <Image src={followItem.icon} alt="" width={34} height={34} />
              ) : (
                <span className="placeholder">◇</span>
              )}
            </span>
            <span className="gear-opt-body">
              <b>{placeholder}</b>
              {followItem && (
                <small className="gear-follow-item">→ {followItem.name}</small>
              )}
            </span>
          </button>
          {rows.map((row) => (
            <button
              key={row.name}
              type="button"
              className={`gear-opt ${value === row.name ? "sel" : ""}`}
              onClick={() => choose(row.name)}
            >
              <span className="gear-ico">
                {row.icon && (
                  <Image src={row.icon} alt="" width={34} height={34} />
                )}
              </span>
              <span className="gear-opt-body">
                <b>{row.name}</b>
                <small>
                  <Stars n={row.rarity} />
                  {row.sub && <span className="gear-sub"> {row.sub}</span>}
                </small>
              </span>
              <span className="gear-opt-meta">
                {row.owned && (
                  <span className="gp-owned" title={row.ownedNote ?? "You own this"}>
                    ✓ Owned
                  </span>
                )}
                {row.tier && (
                  <span className={`gp-tier t-${row.tier.toLowerCase()}`}>
                    {row.tier}
                  </span>
                )}
                {row.pct != null && row.pct > 0 && (
                  <span
                    className="gp-pct"
                    title={`Pick rate: ${Math.round(row.pct)}% of this comp's lineups run it`}
                  >
                    {Math.round(row.pct)}%
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CharacterDetailModal({
  uid,
  detail,
  ownedIds = [],
  ownedWeapons = [],
  activeComp = null,
  error,
  onRefresh,
  onClose,
}: {
  uid: string;
  detail: CharacterDetail | null;
  ownedIds?: number[];
  ownedWeapons?: Array<{ name: string; refinement: number; holder: string }>;
  activeComp?: ActiveComp | null;
  error: string;
  onRefresh?: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"build" | "guide">("build");
  // A refresh nulls the detail in the parent then reloads it, so "waiting for
  // fresh data" is simply: a character is open (onRefresh exists) but detail
  // hasn't arrived yet and there's no error.
  const refreshing = Boolean(onRefresh) && !detail && !error;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const owned = useMemo(() => new Set(ownedIds), [ownedIds]);
  // Weapons the player actually has (equipped across their roster — the only
  // inventory HoYoLAB exposes), keyed by normalized name → best refinement.
  const ownedWeaponMap = useMemo(() => {
    const map = new Map<string, { refinement: number; holder: string }>();
    for (const weapon of ownedWeapons) {
      const key = normalizeName(weapon.name);
      const existing = map.get(key);
      if (!existing || weapon.refinement > existing.refinement)
        map.set(key, { refinement: weapon.refinement, holder: weapon.holder });
    }
    return map;
  }, [ownedWeapons]);
  const combatTalents = detail?.talents.filter((talent) => talent.type === 1);
  const activatedConstellations = detail?.constellations.filter(
    (constellation) => constellation.activated,
  );

  /* ---------- Guide sources ---------- */
  const [consensus, setConsensus] = useState<ConsensusBuild | null>(null);
  const curatedGuide = detail ? findGuide(detail.name) : null;

  useEffect(() => {
    if (!detail || findGuide(detail.name)) return;
    let cancelled = false;
    fetch(`/api/hoyolab/consensus/${detail.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.consensus) setConsensus(data.consensus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detail]);

  const communityConsensus =
    !curatedGuide && detail && consensus?.characterId === detail.id
      ? consensus
      : null;
  const baseGuide =
    curatedGuide ??
    (communityConsensus ? consensusToGuide(communityConsensus) : null);

  /* ---------- Team comps (HoYoLab lineups featuring this character) ---------- */
  const [teams, setTeams] = useState<LineupSuggestion[] | null>(null);
  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    fetch(`/api/hoyolab/teams/${detail.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.teams) setTeams(data.teams);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detail]);

  /* ---------- Farming data ---------- */
  const [farmingData, setFarmingData] = useState<FarmingData | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadFarmingData().then((data) => {
      if (!cancelled) setFarmingData(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- Weapon + set assets (icons/rarity/stat) ---------- */
  const [buildAssets, setBuildAssets] = useState<BuildAssets | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadBuildAssets().then((data) => {
      if (!cancelled) setBuildAssets(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Which team comp we're planning gear for (drives weapon/set usage ratings).
  const [selectedComp, setSelectedComp] = useState<string>("__all");

  /* ---------- Build plan ---------- */
  const [draftPlan, setDraftPlan] = useState<BuildPlan | null>(null);
  const [planCleared, setPlanCleared] = useState(false);
  const storedPlan = detail ? loadPlan(uid, detail.id) : null;
  const plan = draftPlan ?? (planCleared ? null : storedPlan);

  const defaultTargets = curatedGuide
    ? { level: curatedGuide.recommendedLevel, ...curatedGuide.talentTargets }
    : DEFAULT_TARGETS;

  function updatePlan(patch: Partial<BuildPlan>) {
    if (!detail) return;
    const next: BuildPlan = {
      ...(plan ?? {}),
      level: plan?.level ?? defaultTargets.level,
      normal: plan?.normal ?? defaultTargets.normal,
      skill: plan?.skill ?? defaultTargets.skill,
      burst: plan?.burst ?? defaultTargets.burst,
      ...patch,
    };
    setDraftPlan(next);
    setPlanCleared(false);
    savePlan(uid, detail.id, next);
    syncPlans(uid);
  }

  function resetPlan() {
    if (!detail) return;
    clearPlan(uid, detail.id);
    setDraftPlan(null);
    setPlanCleared(true);
    syncPlans(uid);
  }

  const targets = {
    level: plan?.level ?? defaultTargets.level,
    normal: plan?.normal ?? defaultTargets.normal,
    skill: plan?.skill ?? defaultTargets.skill,
    burst: plan?.burst ?? defaultTargets.burst,
  };

  // Current values default to live HoYoLAB data, but the plan can override them
  // for tracking/planning (e.g. "I'm at Lv 70, planning to 90").
  const liveTalents = {
    normal: combatTalents?.[0]?.level ?? 1,
    skill: combatTalents?.[1]?.level ?? 1,
    burst: combatTalents?.[2]?.level ?? 1,
  };
  const current = {
    level: plan?.curLevel ?? detail?.level ?? 1,
    normal: plan?.curNormal ?? liveTalents.normal,
    skill: plan?.curSkill ?? liveTalents.skill,
    burst: plan?.curBurst ?? liveTalents.burst,
    constellation: plan?.curConstellation ?? detail?.constellation ?? 0,
  };

  // effectiveGuide + guideChecks are defined further down, after compGuide (the
  // comp's own recommendation), so "Follow guide" reflects the built comp.
  const statusMark = { pass: "✓", warn: "!", fail: "✗" } as const;

  /* ---------- Material math ---------- */
  const farmingCharacter =
    farmingData && detail ? findFarmingCharacter(farmingData, detail.name) : null;
  const remaining: RemainingItem[] | null =
    detail && farmingData && farmingCharacter && combatTalents
      ? remainingMaterials(
          farmingCharacter,
          farmingData.materials,
          current.level,
          { normal: current.normal, skill: current.skill, burst: current.burst },
          targets,
        )
      : null;

  const curWeaponLevel =
    plan?.curWeaponLevel ?? detail?.weaponDetail?.level ?? 1;
  const targetWeaponLevel = plan?.weaponLevel ?? 90;

  // Weapon ascension materials for the planned (or equipped) weapon.
  const plannedWeaponName =
    plan?.weapon ?? detail?.weaponDetail?.name ?? null;
  const weaponAssetForMats = findWeapon(buildAssets, plannedWeaponName);
  const weaponRemainingItems =
    weaponAssetForMats?.costs && farmingData
      ? weaponRemaining(
          weaponAssetForMats.costs,
          farmingData.materials,
          curWeaponLevel,
          targetWeaponLevel,
        )
      : null;
  const weaponDomainMat = weaponRemainingItems?.find(
    (item) => item.kind === "weaponAscension",
  );
  const weaponDomainMeta =
    weaponDomainMat && farmingData
      ? farmingData.materials[weaponDomainMat.name]
      : null;

  // Per-comp weapon/set usage from the character's HoYoLab lineups: group by
  // the same archetype label as the Teams section and tally what players ran.
  const compUsage = useMemo(() => {
    type Bucket = {
      weapons: Map<string, number>;
      sets: Map<string, number>;
      sands: Map<string, number>;
      goblet: Map<string, number>;
      circlet: Map<string, number>;
      weaponN: number;
      setN: number;
      lineups: number;
    };
    const make = (): Bucket => ({
      weapons: new Map(),
      sets: new Map(),
      sands: new Map(),
      goblet: new Map(),
      circlet: new Map(),
      weaponN: 0,
      setN: 0,
      lineups: 0,
    });
    const groups = new Map<string, Bucket>();
    const all = make();
    const bump = (m: Map<string, number>, k: string) =>
      m.set(k, (m.get(k) ?? 0) + 1);
    const elementOf = (name: string) =>
      farmingData?.characters[normalizeName(name)]?.element ?? null;

    if (detail) {
      for (const lineup of teams ?? []) {
        const members = lineup.teams.find(
          (t) => t.length <= 5 && t.some((m) => m.id === detail.id),
        );
        if (!members) continue;
        const dps =
          members.find(
            (m) => /dps/i.test(m.role ?? "") && !/sub/i.test(m.role ?? ""),
          ) ??
          members.find((m) => /dps/i.test(m.role ?? "")) ??
          members.find((m) => m.id !== detail.id) ??
          members[0];
        const label = dps
          ? compArchetype(
              dps.name,
              elementOf(dps.name),
              members.map((m) => elementOf(m.name)),
            )
          : "Flex";
        const g = groups.get(label) ?? make();
        g.lineups += 1;
        all.lineups += 1;
        if (lineup.focusWeapon) {
          bump(g.weapons, lineup.focusWeapon);
          bump(all.weapons, lineup.focusWeapon);
          g.weaponN += 1;
          all.weaponN += 1;
        }
        if (lineup.focusSets.length) {
          g.setN += 1;
          all.setN += 1;
          for (const s of lineup.focusSets) {
            bump(g.sets, s);
            bump(all.sets, s);
          }
        }
        for (const slot of ["sands", "goblet", "circlet"] as const) {
          const stat = lineup.focusMainStats?.[slot];
          if (stat) {
            bump(g[slot], stat);
            bump(all[slot], stat);
          }
        }
        groups.set(label, g);
      }
    }
    const comps = [...groups.entries()]
      .map(([label, v]) => ({ label, lineups: v.lineups }))
      .sort((a, b) => b.lineups - a.lineups);
    const get = (key: string) => (key === "__all" ? all : groups.get(key) ?? all);
    return { comps, get };
  }, [teams, detail, farmingData]);

  // When a comp is being built app-wide and this character is in it, default the
  // gear/stat ratings to that comp. Runs once per character open, so the user
  // can still override with the chips afterwards.
  const autoSelectedRef = useRef<number | null>(null);
  const activeCompMatches =
    !!activeComp &&
    !!detail &&
    activeComp.members.some((m) => m.id === detail.id) &&
    compUsage.comps.some((c) => c.label === activeComp.label);
  useEffect(() => {
    if (!detail || autoSelectedRef.current === detail.id) return;
    if (activeCompMatches && activeComp) {
      setSelectedComp(activeComp.label);
      autoSelectedRef.current = detail.id;
    } else if (compUsage.comps.length > 0 || teams) {
      setSelectedComp("__all");
      autoSelectedRef.current = detail.id;
    }
  }, [detail, activeComp, activeCompMatches, compUsage, teams]);

  // Top community main stat per slot for the selected comp (drives artifact
  // main-stat suggestions the same way weapon/set % do).
  const compMainStats = useMemo(() => {
    const usage = compUsage.get(selectedComp);
    const top = (m: Map<string, number>) => {
      let best: { name: string; count: number } | null = null;
      let total = 0;
      for (const [name, count] of m) {
        total += count;
        if (!best || count > best.count) best = { name, count };
      }
      return best && total > 0
        ? { name: best.name, pct: (best.count / total) * 100 }
        : null;
    };
    return {
      sands: top(usage.sands),
      goblet: top(usage.goblet),
      circlet: top(usage.circlet),
    };
  }, [compUsage, selectedComp]);

  // The comp's own recommended build (top weapon/set/main-stats it runs), used
  // as the "guide" the player follows when a comp is selected.
  const compGuide: BuildGuide | null = useMemo(() => {
    if (selectedComp === "__all") return null;
    const usage = compUsage.get(selectedComp);
    const topWeapons = [...usage.weapons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topSets = [...usage.sets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    if (topWeapons.length === 0 && topSets.length === 0) return null;
    const total = usage.weaponN || 1;
    return {
      character: detail?.name ?? "",
      role: `${selectedComp} comp`,
      recommendedLevel: baseGuide?.recommendedLevel ?? 90,
      weapons: topWeapons.map(([name, count], index) => {
        const asset = findWeapon(buildAssets, name);
        return {
          name,
          rarity: asset?.rarity ?? 0,
          tier: index === 0 ? ("BiS" as const) : ("Alt" as const),
          stat: asset?.stat ?? "",
          source: `${Math.round((count / total) * 100)}% of this comp`,
        };
      }),
      artifactSets: topSets.map(([name], index) => ({
        name,
        pieces: 4 as const,
        recommended: index === 0,
      })),
      mainStats: {
        sands: compMainStats.sands ? [compMainStats.sands.name] : [],
        goblet: compMainStats.goblet ? [compMainStats.goblet.name] : [],
        circlet: compMainStats.circlet ? [compMainStats.circlet.name] : [],
      },
      substatPriority: baseGuide?.substatPriority ?? [],
      talentTargets: baseGuide?.talentTargets ?? { normal: 1, skill: 1, burst: 1 },
      talentNote: baseGuide?.talentNote,
      statTargets: baseGuide?.statTargets ?? [],
    };
  }, [selectedComp, compUsage, compMainStats, buildAssets, baseGuide, detail]);

  // The guide the player follows: the comp's build when one is selected, else
  // the curated/consensus guide. Plan values override it field by field.
  const followGuide = compGuide ?? baseGuide;
  const effectiveGuide: BuildGuide | null = useMemo(() => {
    if (!plan) return followGuide;
    const base: BuildGuide = followGuide ?? {
      character: detail?.name ?? "",
      role: "Your plan",
      recommendedLevel: 90,
      weapons: [],
      artifactSets: [],
      mainStats: { sands: [], goblet: [], circlet: [] },
      substatPriority: [],
      talentTargets: { normal: 1, skill: 1, burst: 1 },
      statTargets: [],
    };
    return {
      ...base,
      recommendedLevel: plan.level,
      talentTargets: { normal: plan.normal, skill: plan.skill, burst: plan.burst },
      weapons: plan.weapon
        ? [{ name: plan.weapon, rarity: 0, tier: "BiS", stat: "", source: "Your plan" }]
        : base.weapons,
      artifactSets: plan.set
        ? [{ name: plan.set, pieces: 4, recommended: true }]
        : base.artifactSets,
      mainStats: {
        sands: plan.sands ? [plan.sands] : base.mainStats.sands,
        goblet: plan.goblet ? [plan.goblet] : base.mainStats.goblet,
        circlet: plan.circlet ? [plan.circlet] : base.mainStats.circlet,
      },
    };
  }, [plan, followGuide, detail]);

  const guideChecks =
    detail && effectiveGuide ? gradeBuild(effectiveGuide, detail) : null;

  // Artifact quality + overall build grade (graded against the effective guide,
  // so it reflects the comp you're building when one is selected).
  const artifactsGrade = detail
    ? gradeArtifacts(detail, effectiveGuide)
    : null;
  const buildOverall = gradeBuildOverall(guideChecks, artifactsGrade);
  const artVerdict = artifactVerdict(artifactsGrade, guideChecks);
  const pieceGradeBySlot = useMemo(() => {
    const map = new Map<number, PieceGrade>();
    for (const piece of artifactsGrade?.pieces ?? []) map.set(piece.slot, piece);
    return map;
  }, [artifactsGrade]);

  // What "Follow guide" resolves to for the pickers (comp pick when building,
  // else the guide's BiS), enriched with icon for display.
  const followWeaponItem = useMemo(() => {
    const name = followGuide?.weapons[0]?.name;
    if (!name) return null;
    const asset = findWeapon(buildAssets, name);
    return { name, icon: weaponIconUrl(asset?.icon) };
  }, [followGuide, buildAssets]);
  const followSetItem = useMemo(() => {
    const set =
      followGuide?.artifactSets.find((s) => s.recommended) ??
      followGuide?.artifactSets[0];
    if (!set) return null;
    const asset = findSet(buildAssets, set.name);
    return { name: set.name, icon: setIconUrl(asset?.icon) };
  }, [followGuide, buildAssets]);

  const weaponRows: GearRow[] = useMemo(() => {
    const usage = compUsage.get(selectedComp);
    // Owned weapons that match this character's weapon type (so a Sword user
    // doesn't get offered a Polearm you happen to own).
    const charWeaponType =
      farmingCharacter?.weaponType ??
      findWeapon(buildAssets, detail?.weaponDetail?.name)?.type ??
      null;
    const ownedMatching = ownedWeapons
      .filter((w) => {
        const asset = findWeapon(buildAssets, w.name);
        return asset && (!charWeaponType || asset.type === charWeaponType);
      })
      .map((w) => w.name);
    const names = dedupe([
      detail?.weaponDetail?.name,
      ...(curatedGuide?.weapons.map((w) => w.name) ?? []),
      ...(communityConsensus?.weapons.map((w) => w.name) ?? []),
      ...usage.weapons.keys(),
      ...ownedMatching,
    ]);
    const tierRank = (t?: string | null) =>
      t === "BiS" ? 0 : t === "Alt" ? 1 : t === "F2P" ? 2 : 3;
    return names
      .map((name) => {
        const asset = findWeapon(buildAssets, name);
        const tierEntry = curatedGuide?.weapons.find((w) => w.name === name);
        const count = usage.weapons.get(name) ?? 0;
        const pct = usage.weaponN > 0 ? (count / usage.weaponN) * 100 : null;
        const ownedEntry = ownedWeaponMap.get(normalizeName(name));
        return {
          name,
          icon: weaponIconUrl(asset?.icon),
          rarity: asset?.rarity ?? tierEntry?.rarity ?? null,
          sub: asset?.stat ?? tierEntry?.stat ?? null,
          tier: tierEntry?.tier ?? null,
          pct,
          owned: !!ownedEntry,
          ownedNote: ownedEntry
            ? `R${ownedEntry.refinement} · on ${ownedEntry.holder}`
            : null,
        };
      })
      .sort(
        (a, b) =>
          Number(b.owned) - Number(a.owned) ||
          (b.pct ?? 0) - (a.pct ?? 0) ||
          tierRank(a.tier) - tierRank(b.tier) ||
          (b.rarity ?? 0) - (a.rarity ?? 0),
      );
  }, [
    detail,
    curatedGuide,
    communityConsensus,
    compUsage,
    selectedComp,
    buildAssets,
    ownedWeaponMap,
    ownedWeapons,
    farmingCharacter,
  ]);

  const setRows: GearRow[] = useMemo(() => {
    const usage = compUsage.get(selectedComp);
    const names = dedupe([
      ...(detail?.artifacts.map((a) => a.setName) ?? []),
      ...(curatedGuide?.artifactSets.map((s) => s.name) ?? []),
      ...(communityConsensus?.sets.map((s) => s.name) ?? []),
      ...usage.sets.keys(),
    ]);
    return names
      .map((name) => {
        const asset = findSet(buildAssets, name);
        const rec = curatedGuide?.artifactSets.find((s) => s.name === name);
        const count = usage.sets.get(name) ?? 0;
        const pct = usage.setN > 0 ? (count / usage.setN) * 100 : null;
        return {
          name,
          icon: setIconUrl(asset?.icon),
          rarity: asset?.rarity ?? null,
          sub: null,
          tier: rec?.recommended ? "Best" : null,
          pct,
        };
      })
      .sort(
        (a, b) =>
          (b.pct ?? 0) - (a.pct ?? 0) ||
          (a.tier ? 0 : 1) - (b.tier ? 0 : 1) ||
          (b.rarity ?? 0) - (a.rarity ?? 0),
      );
  }, [detail, curatedGuide, communityConsensus, compUsage, selectedComp, buildAssets]);

  // Currently equipped artifact sets (unique + piece count) for the header.
  const equippedSets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const artifact of detail?.artifacts ?? [])
      if (artifact.setName)
        counts.set(artifact.setName, (counts.get(artifact.setName) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [detail]);

  const talentLabels = ["Normal ATK", "Elem. Skill", "Elem. Burst"] as const;
  const talentKeys = ["normal", "skill", "burst"] as const;
  const weaponType = farmingCharacter?.weaponType ?? null;

  // Group the character's team comps by their main DPS (like genshintrack's
  // "Varka Premium" / "Main DPS Durin" archetype groups). Each lineup can
  // hold a large flex pool instead of a real team — keep only ≤5-member teams
  // that include this character.
  const teamGroups = useMemo(() => {
    if (!detail) return [];
    type TeamEntry = {
      lineup: LineupSuggestion;
      members: LineupSuggestion["teams"][number];
    };
    const valid: TeamEntry[] = [];
    for (const lineup of teams ?? []) {
      const members = lineup.teams.find(
        (team) => team.length <= 5 && team.some((m) => m.id === detail.id),
      );
      if (members) valid.push({ lineup, members });
    }

    const elementOf = (name: string) =>
      farmingData?.characters[normalizeName(name)]?.element ?? null;

    const groups = new Map<string, TeamEntry[]>();
    for (const entry of valid) {
      const dps =
        entry.members.find(
          (m) => /dps/i.test(m.role ?? "") && !/sub/i.test(m.role ?? ""),
        ) ??
        entry.members.find((m) => /dps/i.test(m.role ?? "")) ??
        entry.members.find((m) => m.id !== detail.id) ??
        entry.members[0];
      // Community-style label: "<Main DPS> <Reaction>" from team elements.
      const key = dps
        ? compArchetype(
            dps.name,
            elementOf(dps.name),
            entry.members.map((m) => elementOf(m.name)),
          )
        : "Flex";
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }

    return [...groups.entries()]
      .map(([label, entries]) => ({
        label,
        entries: entries
          .sort((a, b) => b.lineup.likes - a.lineup.likes)
          .slice(0, 4),
      }))
      .sort(
        (a, b) =>
          (b.entries[0]?.lineup.likes ?? 0) - (a.entries[0]?.lineup.likes ?? 0),
      )
      .slice(0, 4);
  }, [teams, detail, farmingData]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="character-detail-modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-detail-title"
      >
        {onRefresh && (
          <button
            className="modal-refresh over-banner"
            onClick={onRefresh}
            disabled={!detail}
            title="Fetch this character's latest build now, bypassing the cache"
            aria-label="Refresh build data"
          >
            <span className={refreshing ? "spin" : ""}>↻</span>
          </button>
        )}
        <button
          className="modal-close over-banner"
          onClick={onClose}
          aria-label="Close character details"
        >
          ×
        </button>

        {!detail && !error && (
          <p className="roster-note modal-pad">Loading build from HoYoLAB...</p>
        )}
        {error && (
          <p className="form-error modal-pad" role="alert">
            {error}
          </p>
        )}

        {detail && (
          <>
            {/* Banner */}
            <div
              className="char-banner"
              style={
                detail.image
                  ? { backgroundImage: `url(${detail.image})` }
                  : undefined
              }
            >
              <div className="char-banner-overlay" />
              <div className="char-banner-content">
                <h2 id="character-detail-title">{detail.name}</h2>
                <div className="char-banner-meta">
                  <span className="stars five">{"★".repeat(detail.rarity)}</span>
                  <span className={`elem-tag ${elementTone[detail.element] ?? ""}`}>
                    {detail.element}
                  </span>
                  {weaponType && <span className="elem-tag">{weaponType}</span>}
                </div>
              </div>
              <div className="char-banner-side">
                <span className="eyebrow">CURRENT</span>
                <strong>C{current.constellation}</strong>
              </div>
            </div>

            {/* Tabs */}
            <div className="build-tabs">
              <button
                className={tab === "build" ? "active" : ""}
                onClick={() => setTab("build")}
              >
                ✎ My Build
              </button>
              <button
                className={tab === "guide" ? "active" : ""}
                onClick={() => setTab("guide")}
              >
                ▤ Build Guide
              </button>
            </div>

            <div className="build-body">
              {tab === "build" ? (
                <>
                  <div className="build-intro">
                    <div>
                      <h3>Your progress</h3>
                      <p>
                        Prefilled from HoYoLAB — edit any value to plan ahead.
                      </p>
                    </div>
                    {plan && (
                      <button
                        className="text-button plan-reset"
                        onClick={resetPlan}
                      >
                        Reset plan
                      </button>
                    )}
                  </div>

                  {/* Build + artifacts grade */}
                  {(buildOverall || artifactsGrade) && (
                    <div className="build-block grade-block">
                      {buildOverall && (
                        <div className="grade-card">
                          <span
                            className={`grade-badge g-${buildOverall.grade}`}
                          >
                            {buildOverall.grade}
                          </span>
                          <div className="grade-body">
                            <b>Build grade · {buildOverall.score}/100</b>
                            <small>
                              {buildOverall.total > 0
                                ? `${buildOverall.passed}/${buildOverall.total} guide checks passed`
                                : "Graded on artifact quality"}
                              {activeCompMatches
                                ? ` · vs ${activeComp?.label}`
                                : ""}
                            </small>
                          </div>
                        </div>
                      )}
                      {artifactsGrade && (
                        <div className="grade-card">
                          <span
                            className={`grade-badge g-${artifactsGrade.grade}`}
                          >
                            {artifactsGrade.grade}
                          </span>
                          <div className="grade-body">
                            <b>
                              Artifacts ·{" "}
                              {Math.round(artifactsGrade.avgEfficiency * 100)}%
                              roll quality
                            </b>
                            <small>
                              {artifactsGrade.totalCV} total crit value ·{" "}
                              {artifactsGrade.count}/5 pieces
                            </small>
                          </div>
                        </div>
                      )}
                      {artVerdict && (
                        <div className={`farm-verdict v-${artVerdict.status}`}>
                          <b>
                            {artVerdict.status === "ready"
                              ? "✓ "
                              : artVerdict.status === "farm"
                                ? "⚒ "
                                : "◐ "}
                            {artVerdict.headline}
                          </b>
                          {artVerdict.reasons.length > 0 && (
                            <small>{artVerdict.reasons.join(" · ")}</small>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Character level + constellation */}
                  <div className="build-block">
                    <span className="build-label">CHARACTER LEVEL</span>
                    <div className="cd-row">
                      <div className="cd-field">
                        <span className="cd-cap">CURRENT</span>
                        <Stepper
                          value={current.level}
                          options={LEVEL_STEPS}
                          onChange={(value) => updatePlan({ curLevel: value })}
                          format={(value) => `Lv ${value}`}
                        />
                      </div>
                      <div className="cd-field">
                        <span className="cd-cap">DESIRED</span>
                        <Stepper
                          value={targets.level}
                          options={LEVEL_STEPS}
                          onChange={(value) => updatePlan({ level: value })}
                          format={(value) => `Lv ${value}`}
                        />
                      </div>
                    </div>
                    <span className="cd-cap constellation-cap">CONSTELLATION</span>
                    <div className="constellation-row">
                      {[0, 1, 2, 3, 4, 5, 6].map((con) => (
                        <button
                          key={con}
                          className={`con-pill ${current.constellation === con ? "active" : ""} ${current.constellation >= con ? "owned" : ""}`}
                          onClick={() => updatePlan({ curConstellation: con })}
                        >
                          C{con}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Team comp we're planning gear for */}
                  {compUsage.comps.length > 0 && (
                    <div className="build-block comp-planner">
                      <span className="build-label">PLANNING FOR TEAM COMP</span>
                      <div className="filter-tabs comp-chips">
                        <button
                          className={selectedComp === "__all" ? "active-filter" : ""}
                          onClick={() => setSelectedComp("__all")}
                        >
                          All comps
                        </button>
                        {compUsage.comps.map((comp) => {
                          const isBuilding = activeCompMatches && activeComp?.label === comp.label;
                          return (
                            <button
                              key={comp.label}
                              className={
                                selectedComp === comp.label ? "active-filter" : ""
                              }
                              onClick={() => setSelectedComp(comp.label)}
                            >
                              {isBuilding && <span className="chip-building">★ </span>}
                              {comp.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="guide-footnote">
                        {activeCompMatches
                          ? "★ marks the comp you're building — its numbers are driving the weapon, artifact, and stat suggestions below."
                          : "Weapon, artifact & stat ratings below show how often players run each in this comp (from HoYoLAB lineups)."}
                      </p>
                    </div>
                  )}

                  {/* Weapon */}
                  <div className="build-block">
                    <div className="build-label-row">
                      <span className="build-label">WEAPON</span>
                      {detail.weaponDetail && (
                        <span
                          className="equipped-mini"
                          title={`Equipped: ${detail.weaponDetail.name} · Lv ${detail.weaponDetail.level} · R${detail.weaponDetail.refinement}`}
                        >
                          <Image
                            src={detail.weaponDetail.icon}
                            alt={detail.weaponDetail.name}
                            width={30}
                            height={30}
                          />
                          <i>R{detail.weaponDetail.refinement}</i>
                        </span>
                      )}
                    </div>
                    <div className="cd-field cd-gear">
                      <span className="cd-cap">WEAPON GOAL</span>
                      <GearPicker
                        value={plan?.weapon ?? ""}
                        rows={weaponRows}
                        placeholder="Follow guide"
                        followItem={followWeaponItem}
                        onSelect={(name) =>
                          updatePlan({ weapon: name || undefined })
                        }
                      />
                    </div>
                    <div className="cd-row">
                      <div className="cd-field">
                        <span className="cd-cap">CURRENT</span>
                        <Stepper
                          value={curWeaponLevel}
                          options={LEVEL_STEPS}
                          onChange={(value) =>
                            updatePlan({ curWeaponLevel: value })
                          }
                          format={(value) => `Lv ${value}`}
                        />
                      </div>
                      <div className="cd-field">
                        <span className="cd-cap">DESIRED</span>
                        <Stepper
                          value={targetWeaponLevel}
                          options={LEVEL_STEPS}
                          onChange={(value) => updatePlan({ weaponLevel: value })}
                          format={(value) => `Lv ${value}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Artifacts */}
                  <div className="build-block">
                    <div className="build-label-row">
                      <span className="build-label">ARTIFACTS</span>
                      {equippedSets.length > 0 && (
                        <span className="equipped-mini-group">
                          {equippedSets.map((set) => {
                            const icon = setIconUrl(
                              findSet(buildAssets, set.name)?.icon,
                            );
                            return (
                              <span
                                className="equipped-mini"
                                key={set.name}
                                title={`Equipped: ${set.count}pc ${set.name}`}
                              >
                                {icon ? (
                                  <Image
                                    src={icon}
                                    alt={set.name}
                                    width={30}
                                    height={30}
                                  />
                                ) : (
                                  set.name.slice(0, 1)
                                )}
                                <i>{set.count}</i>
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </div>
                    <div className="filter-tabs set-mode">
                      {(["4pc", "2+2"] as const).map((mode) => (
                        <button
                          key={mode}
                          className={
                            (plan?.setMode ?? "4pc") === mode
                              ? "active-filter"
                              : ""
                          }
                          onClick={() => updatePlan({ setMode: mode })}
                        >
                          {mode === "4pc" ? "4-Piece" : "2 + 2"}
                        </button>
                      ))}
                    </div>
                    <div className="cd-field cd-gear">
                      <span className="cd-cap">SET</span>
                      <GearPicker
                        value={plan?.set ?? ""}
                        rows={setRows}
                        placeholder="Follow guide"
                        followItem={followSetItem}
                        onSelect={(name) =>
                          updatePlan({ set: name || undefined })
                        }
                      />
                    </div>
                    <div className="cd-row three">
                      {(
                        [
                          ["SANDS", "sands", SANDS_STATS],
                          ["GOBLET", "goblet", GOBLET_STATS],
                          ["CIRCLET", "circlet", CIRCLET_STATS],
                        ] as const
                      ).map(([label, key, opts]) => {
                        const suggestion = compMainStats[key];
                        return (
                          <label className="cd-select" key={key}>
                            <span className="cd-cap">{label}</span>
                            <select
                              value={plan?.[key] ?? ""}
                              onChange={(event) =>
                                updatePlan({
                                  [key]: event.target.value || undefined,
                                })
                              }
                            >
                              <option value="">—</option>
                              {opts.map((stat) => (
                                <option key={stat} value={stat}>
                                  {stat}
                                </option>
                              ))}
                            </select>
                            {suggestion && (
                              <button
                                type="button"
                                className="cd-comp-hint"
                                title={`${Math.round(suggestion.pct)}% of this comp's lineups run ${suggestion.name} here — click to use`}
                                onClick={() => updatePlan({ [key]: suggestion.name })}
                              >
                                {suggestion.name} · {Math.round(suggestion.pct)}% pick rate
                              </button>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    {detail.artifacts.length > 0 && (
                      <div className="equipped-artifacts">
                        <span className="cd-cap">CURRENTLY EQUIPPED</span>
                        {[...detail.artifacts]
                          .sort((a, b) => a.slot - b.slot)
                          .map((artifact) => {
                            const pg = pieceGradeBySlot.get(artifact.slot);
                            return (
                              <div className="equip-row" key={artifact.slot}>
                                <span className="equip-icon">
                                  {artifact.icon && (
                                    <Image
                                      src={artifact.icon}
                                      alt={
                                        artifact.slotName ||
                                        slotOrder[artifact.slot - 1]
                                      }
                                      width={40}
                                      height={40}
                                    />
                                  )}
                                  {pg && (
                                    <i
                                      className={`piece-grade g-${pg.grade}`}
                                      title={`${Math.round(pg.efficiency * 100)}% roll quality · CV ${pg.cv}`}
                                    >
                                      {pg.grade}
                                    </i>
                                  )}
                                </span>
                                <span className="equip-copy">
                                  <b>
                                    {artifact.slotName ||
                                      slotOrder[artifact.slot - 1]}
                                    {pg && pg.mainOk === false && (
                                      <span
                                        className="main-off"
                                        title="Off main stat for this slot"
                                      >
                                        {" "}
                                        ⚠ off-stat
                                      </span>
                                    )}
                                  </b>
                                  <small>
                                    +{artifact.level} · {artifact.setName}
                                    {pg ? ` · CV ${pg.cv}` : ""}
                                  </small>
                                  {artifact.subStats.length > 0 && (
                                    <span className="substats">
                                      {artifact.subStats
                                        .map(
                                          (stat) =>
                                            `${stat.name} ${stat.value}` +
                                            (stat.rolls && stat.rolls > 1
                                              ? ` (${stat.rolls})`
                                              : ""),
                                        )
                                        .join(" · ")}
                                    </span>
                                  )}
                                </span>
                                <span className="equip-main">
                                  <b>{artifact.mainStat.value}</b>
                                  <small>{artifact.mainStat.name}</small>
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* Talents */}
                  <div className="build-block">
                    <span className="build-label">TALENTS</span>
                    <div className="talent-cols">
                      {talentKeys.map((key, index) => {
                        const curField = `cur${key[0].toUpperCase()}${key.slice(1)}` as
                          | "curNormal"
                          | "curSkill"
                          | "curBurst";
                        return (
                          <div className="talent-col" key={key}>
                            <span className="talent-col-name">
                              {talentLabels[index]}
                            </span>
                            <span className="cd-cap">
                              CURRENT
                              {current[key] >= 10 && (
                                <span className="crowned"> ♛</span>
                              )}
                            </span>
                            <Stepper
                              value={current[key]}
                              min={1}
                              max={10}
                              onChange={(value) =>
                                updatePlan({ [curField]: value })
                              }
                              format={(value) => `Lv ${value}`}
                            />
                            <span className="cd-cap">TARGET</span>
                            <Stepper
                              value={targets[key]}
                              min={1}
                              max={10}
                              onChange={(value) => updatePlan({ [key]: value })}
                              format={(value) => `Lv ${value}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {effectiveGuide?.talentNote && (
                      <p className="guide-footnote">
                        {effectiveGuide.talentNote}
                      </p>
                    )}
                  </div>

                  {/* Materials still needed */}
                  {remaining && (
                    <div className="build-block">
                      <span className="build-label">
                        MATERIALS TO FARM → LV {targets.level} · {targets.normal}/
                        {targets.skill}/{targets.burst}
                      </span>
                      {remaining.length === 0 ? (
                        <p className="roster-note">
                          ✓ Nothing left — targets reached.
                        </p>
                      ) : (
                        <div className="mat-tiles">
                          {remaining.map((item) => {
                            const url = iconUrl(item.icon);
                            return (
                              <span
                                className={`mat-tile ${item.kind}`}
                                key={item.name}
                                title={item.name}
                              >
                                {url ? (
                                  <Image
                                    src={url}
                                    alt={item.name}
                                    width={40}
                                    height={40}
                                  />
                                ) : (
                                  <span className="mat-fallback">
                                    {item.name.slice(0, 2)}
                                  </span>
                                )}
                                <span className="mat-qty">
                                  {formatCount(item.count)}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {farmingCharacter?.bookDays && remaining.length > 0 && (
                        <p className="guide-footnote">
                          {domainForBook(farmingCharacter.book)?.location ??
                            farmingCharacter.bookDomain?.replace(
                              /^Domain of \w+: /,
                              "",
                            )}{" "}
                          ·{" "}
                          {farmingCharacter.bookDays
                            .map((day) => day.slice(0, 3))
                            .join(" / ")}
                          {farmingCharacter.weeklyBoss
                            ? ` · Weekly: ${farmingCharacter.weeklyBoss}`
                            : ""}
                          {farmingCharacter.bossSource
                            ? ` · Boss: ${farmingCharacter.bossSource}`
                            : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Weapon ascension materials */}
                  {weaponRemainingItems && weaponRemainingItems.length > 0 && (
                    <div className="build-block">
                      <span className="build-label">
                        WEAPON MATERIALS → LV {targetWeaponLevel}
                      </span>
                      <div className="mat-tiles">
                        {weaponRemainingItems.map((item) => {
                          const url = iconUrl(item.icon);
                          return (
                            <span
                              className={`mat-tile ${item.kind}`}
                              key={item.name}
                              title={item.name}
                            >
                              {url ? (
                                <Image
                                  src={url}
                                  alt={item.name}
                                  width={40}
                                  height={40}
                                />
                              ) : (
                                <span className="mat-fallback">
                                  {item.name.slice(0, 2)}
                                </span>
                              )}
                              <span className="mat-qty">
                                {formatCount(item.count)}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                      <p className="guide-footnote">
                        {plannedWeaponName}
                        {weaponDomainMeta?.domain
                          ? ` · ${weaponDomainMeta.domain.replace(/^Domain of \w+: /, "")}`
                          : ""}
                        {weaponDomainMeta?.days
                          ? ` · ${weaponDomainMeta.days.map((d) => d.slice(0, 3)).join(" / ")}`
                          : ""}
                      </p>
                    </div>
                  )}

                  <button className="primary-button save-changes" onClick={onClose}>
                    Save &amp; close <span>→</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Build Guide tab */}
                  {effectiveGuide && guideChecks && (
                    <div className="build-block">
                      <span className="build-label">
                        {plan
                          ? "GRADED AGAINST YOUR PLAN"
                          : curatedGuide
                            ? "GUIDE CHECK"
                            : "COMMUNITY CONSENSUS"}{" "}
                        · {effectiveGuide.role.toUpperCase()}
                      </span>
                      <div className="check-list">
                        {guideChecks.map((check, index) => (
                          <div
                            className={`check-row ${check.status}`}
                            key={`${check.label}-${index}`}
                          >
                            <span className="check-mark" aria-hidden="true">
                              {statusMark[check.status]}
                            </span>
                            <span className="check-label">{check.label}</span>
                            <span className="check-detail">{check.detail}</span>
                          </div>
                        ))}
                      </div>
                      {curatedGuide && !plan && (
                        <p className="guide-footnote">
                          Targets — NA {effectiveGuide.talentTargets.normal} /
                          Skill {effectiveGuide.talentTargets.skill} / Burst{" "}
                          {effectiveGuide.talentTargets.burst} · Substats:{" "}
                          {effectiveGuide.substatPriority.join(" > ")}
                        </p>
                      )}
                      {communityConsensus && (
                        <p className="guide-footnote">
                          Aggregated from {communityConsensus.sampleSize} builds
                          in HoYoLAB&apos;s top lineups
                          {communityConsensus.strategyUrl && (
                            <>
                              {" · "}
                              <a
                                className="guide-link"
                                href={communityConsensus.strategyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Official HoYoLAB guide ↗
                              </a>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Recommended build */}
                  {baseGuide && (
                    <div className="build-block">
                      <span className="build-label">RECOMMENDED</span>
                      {baseGuide.weapons.length > 0 && (
                        <div className="rec-line">
                          <i>Weapons</i>
                          <span>
                            {baseGuide.weapons
                              .slice(0, 4)
                              .map(
                                (weapon) =>
                                  `${weapon.name}${weapon.tier ? ` (${weapon.tier})` : ""}`,
                              )
                              .join(" · ")}
                          </span>
                        </div>
                      )}
                      {baseGuide.artifactSets.length > 0 && (
                        <div className="rec-line">
                          <i>Artifacts</i>
                          <span>
                            {baseGuide.artifactSets
                              .map((set) => `${set.pieces}pc ${set.name}`)
                              .join(" / ")}
                          </span>
                        </div>
                      )}
                      {baseGuide.substatPriority.length > 0 && (
                        <div className="rec-line">
                          <i>Substats</i>
                          <span>{baseGuide.substatPriority.join(" > ")}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Team comps featuring this character (HoYoLab lineups),
                      grouped by main-DPS archetype like genshintrack. */}
                  {teamGroups.length > 0 && (
                    <div className="build-block">
                      <span className="build-label">
                        TEAMS · {detail.name.toUpperCase()} FITS IN
                      </span>
                      <div className="team-groups">
                        {teamGroups.map((group) => {
                          const isOpen = openGroups[group.label] ?? true;
                          return (
                            <div className="team-group" key={group.label}>
                              <button
                                type="button"
                                className="team-group-head"
                                onClick={() =>
                                  setOpenGroups((prev) => ({
                                    ...prev,
                                    [group.label]: !isOpen,
                                  }))
                                }
                              >
                                <span className="team-group-title">
                                  {group.label}
                                </span>
                                <span className="team-group-meta">
                                  {group.entries.length} comp
                                  {group.entries.length === 1 ? "" : "s"}
                                </span>
                                <span className="team-group-caret">
                                  {isOpen ? "▾" : "▸"}
                                </span>
                              </button>
                              {isOpen && (
                                <div className="team-list">
                                  {group.entries.map(({ lineup, members }) => {
                                    const ownedCount = members.filter(
                                      (m) => owned.has(m.id),
                                    ).length;
                                    return (
                                      <div className="team-row" key={lineup.id}>
                                        <div className="team-members">
                                          {members.map((member) => {
                                            const isSelf =
                                              member.id === detail.id;
                                            const isOwned = owned.has(member.id);
                                            return (
                                              <div
                                                className={`team-member${
                                                  isSelf ? " is-self" : ""
                                                }${isOwned ? " is-owned" : ""}`}
                                                key={member.id}
                                                title={
                                                  isOwned && !isSelf
                                                    ? `${member.name} · you own this`
                                                    : member.name
                                                }
                                              >
                                                <span className="team-avatar">
                                                  {member.icon ? (
                                                    <Image
                                                      src={member.icon}
                                                      alt={member.name}
                                                      width={40}
                                                      height={40}
                                                    />
                                                  ) : (
                                                    member.name.slice(0, 1)
                                                  )}
                                                  {isOwned && (
                                                    <i className="team-own-tick">
                                                      ✓
                                                    </i>
                                                  )}
                                                </span>
                                                <b>{member.name}</b>
                                                {member.role && (
                                                  <small>{member.role}</small>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                        <div className="team-row-meta">
                                          <span
                                            className={`team-own-count${
                                              ownedCount >= members.length
                                                ? " is-complete"
                                                : ""
                                            }`}
                                          >
                                            You own {ownedCount}/{members.length}
                                          </span>
                                          <span className="team-likes">
                                            ♥ {lineup.likes}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="guide-footnote">
                        Popular team comps from HoYoLAB players that use{" "}
                        {detail.name}, grouped by main DPS. Characters you own are
                        marked with a ✓.
                      </p>
                    </div>
                  )}

                  {/* Current stats */}
                  {detail.stats.length > 0 && (
                    <div className="build-block">
                      <span className="build-label">CURRENT STATS</span>
                      <div className="detail-stats">
                        {detail.stats.map((stat) => (
                          <span className="stat-line" key={stat.name}>
                            <span>{stat.name}</span>
                            <b>{stat.final}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Current artifacts */}
                  <div className="build-block">
                    <span className="build-label">
                      EQUIPPED ARTIFACTS ({detail.artifacts.length} / 5)
                    </span>
                    {detail.artifacts.length === 0 && (
                      <p className="roster-note">No artifacts equipped.</p>
                    )}
                    {[...detail.artifacts]
                      .sort((a, b) => a.slot - b.slot)
                      .map((artifact) => (
                        <div className="equip-row" key={artifact.slot}>
                          <span className="equip-icon">
                            <Image
                              src={artifact.icon}
                              alt={
                                artifact.slotName || slotOrder[artifact.slot - 1]
                              }
                              width={44}
                              height={44}
                            />
                          </span>
                          <span className="equip-copy">
                            <b>{artifact.name}</b>
                            <small>
                              {artifact.slotName || slotOrder[artifact.slot - 1]}{" "}
                              · +{artifact.level} · {artifact.setName}
                            </small>
                            <span className="substats">
                              {artifact.subStats
                                .map(
                                  (stat) =>
                                    `${stat.name} ${stat.value}` +
                                    (stat.rolls && stat.rolls > 1
                                      ? ` (${stat.rolls})`
                                      : ""),
                                )
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="equip-main">
                            <b>{artifact.mainStat.value}</b>
                            <small>{artifact.mainStat.name}</small>
                          </span>
                        </div>
                      ))}
                  </div>

                  {activatedConstellations &&
                    activatedConstellations.length > 0 && (
                      <div className="build-block">
                        <span className="build-label">
                          CONSTELLATIONS UNLOCKED
                        </span>
                        <div className="talent-chips">
                          {activatedConstellations.map((constellation) => (
                            <span key={constellation.position}>
                              C{constellation.position}
                              <b>{constellation.name}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
