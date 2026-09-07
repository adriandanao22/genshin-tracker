"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { RosterCharacter } from "@/lib/hoyolab-game-record";
import type { LineupSuggestion, LineupTeamMember } from "@/lib/hoyolab-lineup";

type ScoredLineup = LineupSuggestion & {
  owned: number;
  total: number;
  averageLevel: number;
};

function scoreLineups(
  lineups: LineupSuggestion[],
  roster: RosterCharacter[],
): ScoredLineup[] {
  const byId = new Map(roster.map((character) => [character.id, character]));
  return lineups
    .map((lineup) => {
      const members = lineup.teams.flat();
      const ownedMembers = members.filter((member) => byId.has(member.id));
      const levels = ownedMembers.map(
        (member) => byId.get(member.id)?.level ?? 0,
      );
      return {
        ...lineup,
        owned: ownedMembers.length,
        total: members.length,
        averageLevel: levels.length
          ? Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length)
          : 0,
      };
    })
    .sort(
      (a, b) =>
        b.owned / b.total - a.owned / a.total ||
        b.averageLevel - a.averageLevel ||
        b.likes - a.likes,
    );
}

function TeamAvatars({
  team,
  ownedIds,
}: {
  team: LineupTeamMember[];
  ownedIds: Set<number>;
}) {
  return (
    <span className="farm-avatars">
      {team.map((member) => (
        <span
          className={`farm-avatar ${ownedIds.has(member.id) ? "" : "missing"}`}
          key={member.id}
          title={`${member.name}${ownedIds.has(member.id) ? "" : " (not owned)"}`}
        >
          {member.icon ? (
            <Image src={member.icon} alt={member.name} width={26} height={26} />
          ) : (
            member.name.slice(0, 1)
          )}
        </span>
      ))}
    </span>
  );
}

export function LineupsPanel({
  roster,
  connected,
}: {
  roster: RosterCharacter[] | null;
  connected: boolean;
}) {
  const [lineups, setLineups] = useState<LineupSuggestion[] | null>(null);
  const [source, setSource] = useState<"match" | "hot" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    fetch("/api/hoyolab/lineups")
      .then(async (response) => ({
        ok: response.ok,
        data: await response.json(),
      }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data.error || "Could not load lineups.");
        setLineups(data.lineups);
        setSource(data.source);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Could not load lineups.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const scored = useMemo(
    () => (lineups && roster ? scoreLineups(lineups, roster) : null),
    [lineups, roster],
  );
  const ownedIds = useMemo(
    () => new Set((roster ?? []).map((character) => character.id)),
    [roster],
  );

  return (
    <section className="guide-panel panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {source === "match"
              ? "TEAMS MATCHED TO YOUR ACCOUNT"
              : "TEAM SUGGESTIONS"}
          </span>
          <h3>Lineups for your roster</h3>
        </div>
      </div>
      {!connected && (
        <p className="roster-note">
          Connect HoYoLAB to get team suggestions scored against the characters
          you actually own — and how built they are.
        </p>
      )}
      {connected && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {connected && !error && !scored && (
        <p className="roster-note">Finding lineups from HoYoLAB...</p>
      )}
      {scored && (
        <div className="lineup-list">
          {scored.slice(0, 4).map((lineup) => (
            <div className="lineup-row" key={lineup.id}>
              <span className="lineup-copy">
                <b>{lineup.title}</b>
                <small>
                  You own {lineup.owned} / {lineup.total}
                  {lineup.averageLevel > 0 &&
                    ` · avg Lv ${lineup.averageLevel}`}{" "}
                  · ♥ {lineup.likes}
                </small>
              </span>
              <TeamAvatars team={lineup.teams[0] ?? []} ownedIds={ownedIds} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
