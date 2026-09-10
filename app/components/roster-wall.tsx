"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { findGuide } from "@/lib/build-guides";
import { hasCommunityGuide } from "@/lib/consensus-data";
import type { RosterCharacter } from "@/lib/hoyolab-game-record";
import { elementTone } from "./character-detail-modal";

const elements = [
  "All",
  "Priority",
  "Pyro",
  "Hydro",
  "Anemo",
  "Electro",
  "Dendro",
  "Cryo",
  "Geo",
];

export function RosterWall({
  roster,
  connected,
  error,
  priorityIds,
  onOpen,
  onTogglePriority,
  onConnect,
}: {
  roster: RosterCharacter[] | null;
  connected: boolean;
  error: string;
  priorityIds: number[];
  onOpen: (characterId: number) => void;
  onTogglePriority: (characterId: number) => void;
  onConnect: () => void;
}) {
  const [elementFilter, setElementFilter] = useState("All");
  const prioritySet = useMemo(() => new Set(priorityIds), [priorityIds]);

  const filtered = useMemo(() => {
    const list = (roster ?? []).filter((character) => {
      if (elementFilter === "All") return true;
      if (elementFilter === "Priority") return prioritySet.has(character.id);
      return character.element === elementFilter;
    });
    // Priority characters float to the top, keeping level order within groups.
    return [...list].sort(
      (a, b) =>
        (prioritySet.has(b.id) ? 1 : 0) - (prioritySet.has(a.id) ? 1 : 0),
    );
  }, [roster, elementFilter, prioritySet]);

  return (
    <section className="roster-wall panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {roster ? `MY ROSTER · ${roster.length} CHARACTERS` : "MY ROSTER"}
          </span>
          <h3>Find your mains</h3>
        </div>
        {roster && (
          <div className="filter-tabs">
            {elements.map((element) => (
              <button
                key={element}
                className={elementFilter === element ? "active-filter" : ""}
                onClick={() => setElementFilter(element)}
              >
                {element === "Priority"
                  ? `★ Priority${priorityIds.length ? ` ${priorityIds.length}` : ""}`
                  : element}
              </button>
            ))}
          </div>
        )}
      </div>

      {connected && roster && (
        <p className="roster-note wall-hint">
          Star the characters you&apos;re building — they lead your Overview
          farming plan.
        </p>
      )}

      {!connected && (
        <div className="wall-empty">
          <p className="roster-note">
            Sign in with HoYoLAB to see your full roster here — every character
            with their level, constellations, and build at a glance.
          </p>
          <button className="primary-button" onClick={onConnect}>
            Connect HoYoLAB <span>→</span>
          </button>
        </div>
      )}
      {connected && !roster && !error && (
        <p className="roster-note">Syncing your roster from HoYoLAB...</p>
      )}
      {connected && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {connected && roster && filtered.length === 0 && (
        <p className="roster-note">
          {elementFilter === "Priority"
            ? "No priority characters yet — tap a ☆ to add one."
            : `No ${elementFilter} characters yet.`}
        </p>
      )}
      {connected && roster && filtered.length > 0 && (
        <div className="wall-grid">
          {filtered.map((character) => {
            const isPriority = prioritySet.has(character.id);
            return (
              <div
                className={`wall-card ${isPriority ? "is-priority" : ""}`}
                key={character.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(character.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(character.id);
                  }
                }}
              >
                <span
                  className={`character-avatar ${elementTone[character.element] ?? "gold"}`}
                >
                  {character.icon ? (
                    <Image
                      src={character.icon}
                      alt={character.name}
                      width={52}
                      height={52}
                    />
                  ) : (
                    character.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="wall-copy">
                  <b>{character.name}</b>
                  <span className="wall-meta">
                    <span
                      className={`stars ${character.rarity === 5 ? "five" : "four"}`}
                    >
                      {"★".repeat(character.rarity)}
                    </span>
                    {(findGuide(character.name) ||
                      hasCommunityGuide(character.id)) && (
                      <span className="guide-badge inline">Guide</span>
                    )}
                  </span>
                  <small>
                    Lv {character.level} · C{character.constellation}
                    {character.weapon ? ` · ${character.weapon.name}` : ""}
                  </small>
                </span>
                <button
                  className={`pin-button ${isPriority ? "pinned" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePriority(character.id);
                  }}
                  aria-pressed={isPriority}
                  aria-label={
                    isPriority
                      ? `Remove ${character.name} from build priority`
                      : `Add ${character.name} to build priority`
                  }
                  title={
                    isPriority ? "Remove from priority" : "Add to priority"
                  }
                >
                  {isPriority ? "★" : "☆"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
