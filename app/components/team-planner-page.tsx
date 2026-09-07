"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  groupTeamsByArchetype,
  normalizeName,
} from "@/lib/character-guides";
import { loadFarmingData, type FarmingData } from "@/lib/farming";
import type { LineupSuggestion } from "@/lib/hoyolab-lineup";
import type { RosterCharacter } from "@/lib/hoyolab-game-record";
import type { ActiveComp } from "@/lib/active-comp";
import { elementTone } from "./character-detail-modal";

export function TeamPlannerPage({
  roster,
  connected,
  priorityIds = [],
  activeComp,
  onChooseComp,
  onOpen,
  onConnect,
}: {
  roster: RosterCharacter[] | null;
  connected: boolean;
  priorityIds?: number[];
  activeComp: ActiveComp | null;
  onChooseComp: (comp: ActiveComp | null) => void;
  onOpen: (characterId: number) => void;
  onConnect: () => void;
}) {
  const [focusId, setFocusId] = useState<number | null>(null);
  const [teams, setTeams] = useState<LineupSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [farmingData, setFarmingData] = useState<FarmingData | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFarmingData().then((d) => !cancelled && setFarmingData(d));
    return () => {
      cancelled = true;
    };
  }, []);

  const rosterById = useMemo(() => {
    const map = new Map<number, RosterCharacter>();
    for (const c of roster ?? []) map.set(c.id, c);
    return map;
  }, [roster]);

  // Default the focus character to the first priority pick, else first owned.
  useEffect(() => {
    if (focusId !== null || !roster || roster.length === 0) return;
    const firstPriority = roster.find((c) => priorityIds.includes(c.id));
    setFocusId(firstPriority?.id ?? roster[0].id);
  }, [roster, priorityIds, focusId]);

  useEffect(() => {
    if (focusId === null) return;
    let cancelled = false;
    setLoading(true);
    setTeams(null);
    fetch(`/api/hoyolab/teams/${focusId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setTeams(data?.teams ?? []);
      })
      .catch(() => !cancelled && setTeams([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [focusId]);

  const groups = useMemo(() => {
    if (!teams || focusId === null) return [];
    const elementOf = (name: string) =>
      farmingData?.characters[normalizeName(name)]?.element ?? null;
    return groupTeamsByArchetype(teams, focusId, elementOf);
  }, [teams, focusId, farmingData]);

  if (!connected) {
    return (
      <section className="panel dash-empty">
        <span className="eyebrow coral-text">TEAM PLANNER</span>
        <h2>Plan the team you&apos;re building toward.</h2>
        <p className="roster-note">
          Connect HoYoLAB to see the comps your characters fit into, which
          teammates you already own, and what&apos;s missing.
        </p>
        <button className="primary-button" onClick={onConnect}>
          Connect HoYoLAB <span>→</span>
        </button>
      </section>
    );
  }

  return (
    <section className="guides-page panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">TEAM PLANNER</span>
          <h3>Comps built around your characters</h3>
        </div>
      </div>
      <p className="roster-note">
        Pick a character to see the team comps they anchor (from HoYoLAB
        lineups), grouped by reaction. Teammates you own are marked; the rest are
        what you&apos;d need to build the comp.
      </p>

      {activeComp && (
        <div className="tp-building">
          <span className="tp-building-tag">BUILDING</span>
          <b>{activeComp.label}</b>
          <span className="tp-building-members">
            {activeComp.members.map((m) => m.name).join(" · ")}
          </span>
          <button
            className="text-button tp-building-clear"
            onClick={() => onChooseComp(null)}
          >
            Clear
          </button>
        </div>
      )}

      {/* Focus character picker */}
      <div className="tp-focus">
        {(roster ?? []).map((character) => (
          <button
            key={character.id}
            className={`tp-focus-chip ${focusId === character.id ? "active" : ""}`}
            onClick={() => setFocusId(character.id)}
            title={character.name}
          >
            <span
              className={`character-avatar ${elementTone[character.element] ?? "gold"}`}
            >
              {character.icon ? (
                <Image
                  src={character.icon}
                  alt={character.name}
                  width={38}
                  height={38}
                />
              ) : (
                character.name.slice(0, 1)
              )}
            </span>
            <b>{character.name}</b>
          </button>
        ))}
      </div>

      {loading && <p className="roster-note">Loading comps…</p>}
      {!loading && groups.length === 0 && (
        <p className="roster-note">
          No published lineups found for this character yet.
        </p>
      )}

      <div className="tp-groups">
        {groups.map((group) => (
          <div className="tp-group" key={group.label}>
            <div className="tp-group-head">
              <span className="tp-group-title">{group.label}</span>
              <span className="tp-group-meta">
                {group.entries.length} comp
                {group.entries.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="tp-comp-list">
              {group.entries.map(({ lineup, members }) => {
                const ownedCount = members.filter((m) =>
                  rosterById.has(m.id),
                ).length;
                const isActive = activeComp?.lineupId === lineup.id;
                return (
                  <div
                    className={`tp-comp${isActive ? " active" : ""}`}
                    key={lineup.id}
                  >
                    <div className="tp-members">
                      {members.map((member) => {
                        const owned = rosterById.get(member.id);
                        const isFocus = member.id === focusId;
                        return (
                          <button
                            key={member.id}
                            className={`tp-member${owned ? " owned" : " missing"}${
                              isFocus ? " is-focus" : ""
                            }`}
                            title={
                              owned
                                ? `${member.name} · Lv ${owned.level}`
                                : `${member.name} · not in your roster`
                            }
                            onClick={() => owned && onOpen(member.id)}
                            disabled={!owned}
                          >
                            <span className="tp-avatar">
                              {member.icon ? (
                                <Image
                                  src={member.icon}
                                  alt={member.name}
                                  width={46}
                                  height={46}
                                />
                              ) : (
                                member.name.slice(0, 1)
                              )}
                              {owned ? (
                                <i className="tp-tick">✓</i>
                              ) : (
                                <i className="tp-missing">+</i>
                              )}
                            </span>
                            <b>{member.name}</b>
                            {member.role && <small>{member.role}</small>}
                            {owned?.weapon && (
                              <span className="tp-weapon" title={owned.weapon.name}>
                                {owned.weapon.icon && (
                                  <Image
                                    src={owned.weapon.icon}
                                    alt={owned.weapon.name}
                                    width={18}
                                    height={18}
                                  />
                                )}
                                Lv {owned.level}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="tp-comp-meta">
                      <span
                        className={`tp-own-count${
                          ownedCount >= members.length ? " complete" : ""
                        }`}
                      >
                        You own {ownedCount}/{members.length}
                      </span>
                      <span className="tp-likes">♥ {lineup.likes}</span>
                      <button
                        className={`tp-build-btn${isActive ? " active" : ""}`}
                        onClick={() =>
                          onChooseComp({
                            label: group.label,
                            anchorId: focusId as number,
                            anchorName:
                              rosterById.get(focusId as number)?.name ?? "",
                            lineupId: lineup.id,
                            likes: lineup.likes,
                            members: members.map((m) => ({
                              id: m.id,
                              name: m.name,
                              role: m.role,
                            })),
                          })
                        }
                      >
                        {isActive ? "✓ Building" : "Build this"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
