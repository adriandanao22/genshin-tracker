"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  loadFarmingData,
  iconUrl,
  type FarmingData,
  type FarmingCharacter,
} from "@/lib/farming";
import { parseInventoryFile, type Inventory } from "@/lib/inventory";
import type { ActiveComp } from "@/lib/active-comp";
import type { RosterCharacter } from "@/lib/hoyolab-game-record";

// Material categories, in the order they're shown. `kind` matches the values
// in farming.json's material catalog.
const KINDS: Array<{ key: string; label: string }> = [
  { key: "book", label: "Talent Books" },
  { key: "gem", label: "Ascension Gems" },
  { key: "boss", label: "Boss Materials" },
  { key: "weekly", label: "Weekly Boss Materials" },
  { key: "specialty", label: "Local Specialties" },
  { key: "common", label: "Common Materials" },
  { key: "weaponAscension", label: "Weapon Ascension" },
  { key: "crown", label: "Crowns" },
  { key: "mora", label: "Mora" },
];
const KIND_LABEL = new Map(KINDS.map((k) => [k.key, k.label]));

type Material = { name: string; kind: string; rarity: number; icon: string | null };

/** Every material name a character needs across ascension + talent costs. */
function materialsForCharacter(fc: FarmingCharacter | undefined): string[] {
  if (!fc) return [];
  const out = new Set<string>();
  for (const items of Object.values(fc.ascensionCosts ?? {}))
    for (const it of items) out.add(it.name);
  for (const items of Object.values(fc.talentCosts ?? {}))
    for (const it of items) out.add(it.name);
  for (const n of [fc.book, fc.weekly, fc.boss, fc.specialty, fc.common, fc.gem])
    if (n) out.add(n);
  return [...out];
}

export function InventoryPage({
  connected,
  roster,
  priorityIds,
  activeComp,
  inventory,
  onChange,
  onConnect,
}: {
  uid: string;
  connected: boolean;
  roster: RosterCharacter[] | null;
  priorityIds: number[];
  activeComp: ActiveComp | null;
  inventory: Inventory | null;
  onChange: (next: Inventory | null) => void;
  onConnect: () => void;
}) {
  const [data, setData] = useState<FarmingData | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("All");
  const [relevantOnly, setRelevantOnly] = useState(true);
  const [importMsg, setImportMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadFarmingData().then((loaded) => {
      if (!cancelled) setData(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Full material catalog from the game data.
  const materials = useMemo<Material[]>(() => {
    if (!data) return [];
    return Object.entries(data.materials).map(([name, meta]) => ({
      name,
      kind: meta.kind,
      rarity: meta.rarity ?? 0,
      icon: meta.icon,
    }));
  }, [data]);

  // Names needed by the active comp's members, and by all tracked characters —
  // used to prioritize what you actually farm for. farming.json is keyed by
  // slug, so look characters up by their normalized display name instead.
  const { compNeeded, trackedNeeded } = useMemo(() => {
    const comp = new Set<string>();
    const tracked = new Set<string>();
    if (data) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const charByName = new Map(
        Object.values(data.characters).map((c) => [norm(c.name), c]),
      );
      const nameById = new Map((roster ?? []).map((c) => [c.id, c.name]));
      for (const m of activeComp?.members ?? [])
        for (const n of materialsForCharacter(charByName.get(norm(m.name))))
          comp.add(n);
      for (const id of priorityIds) {
        const charName = nameById.get(id);
        if (charName)
          for (const n of materialsForCharacter(charByName.get(norm(charName))))
            tracked.add(n);
      }
    }
    // Comp members are always part of "tracked" too.
    for (const n of comp) tracked.add(n);
    return { compNeeded: comp, trackedNeeded: tracked };
  }, [data, roster, priorityIds, activeComp]);

  const hasRelevant = trackedNeeded.size > 0;

  function setOwned(name: string, value: number | null) {
    const next: Inventory = { ...(inventory ?? {}) };
    if (value && value > 0) next[name] = value;
    else delete next[name];
    onChange(Object.keys(next).length > 0 ? next : null);
  }

  async function handleImport(file: File) {
    const parsed = parseInventoryFile(await file.text());
    if (!parsed) {
      setImportMsg("Couldn't read that file — expected a GOOD / Inventory-Kamera JSON.");
      return;
    }
    // Merge onto what's there so a scan doesn't wipe manual entries it lacks.
    onChange({ ...(inventory ?? {}), ...parsed.inventory });
    setImportMsg(`Imported ${parsed.count} materials.`);
  }

  // Filter + sort: comp materials first, then other tracked, then the rest;
  // ties broken by rarity then name. Search and kind/relevance narrow the list.
  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const rank = (name: string) =>
      compNeeded.has(name) ? 0 : trackedNeeded.has(name) ? 1 : 2;
    return materials
      .filter((m) => (kindFilter === "All" ? true : m.kind === kindFilter))
      .filter((m) => (query ? m.name.toLowerCase().includes(query) : true))
      .filter((m) =>
        relevantOnly && hasRelevant && !query ? trackedNeeded.has(m.name) : true,
      )
      .sort((a, b) => {
        const r = rank(a.name) - rank(b.name);
        if (r !== 0) return r;
        if (b.rarity !== a.rarity) return b.rarity - a.rarity;
        return a.name.localeCompare(b.name);
      });
  }, [
    materials,
    kindFilter,
    query,
    relevantOnly,
    hasRelevant,
    compNeeded,
    trackedNeeded,
  ]);

  // Group the visible list by kind, keeping the sorted order within each group.
  const groups = useMemo(() => {
    const map = new Map<string, Material[]>();
    for (const m of visible) {
      const list = map.get(m.kind) ?? [];
      list.push(m);
      map.set(m.kind, list);
    }
    return KINDS.filter((k) => map.has(k.key)).map((k) => ({
      key: k.key,
      label: k.label,
      items: map.get(k.key)!,
    }));
  }, [visible]);

  const setCount = inventory ? Object.keys(inventory).length : 0;

  if (!connected) {
    return (
      <div className="inventory-page">
        <p className="roster-note">
          Connect your account to track your material inventory.{" "}
          <button className="link-button" onClick={onConnect}>
            Connect <span>↗</span>
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <header className="inv-head">
        <div>
          <span className="eyebrow coral-text">MANUAL INVENTORY</span>
          <h1>Your Materials</h1>
          <p className="dash-sub">
            Type how many of each material you own — it feeds the “still needed”
            counts on your Overview. {setCount > 0 && <b>{setCount} set.</b>}
          </p>
          {activeComp && compNeeded.size > 0 && (
            <p className="comp-legend">
              <span className="comp-dot" /> Gold items are used by your{" "}
              <b>{activeComp.label}</b> team — shown first.
            </p>
          )}
        </div>
        <div className="inv-head-actions">
          <label className="pill-button inv-import">
            ⭳ Import JSON
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImport(file);
                event.target.value = "";
              }}
            />
          </label>
          {setCount > 0 && (
            <button className="text-button" onClick={() => onChange(null)}>
              Clear all
            </button>
          )}
        </div>
      </header>

      <div className="inv-controls">
        <input
          className="inv-search"
          type="search"
          placeholder="Search materials…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {hasRelevant && (
          <button
            className={`pill-button ${relevantOnly ? "active-filter" : ""}`}
            onClick={() => setRelevantOnly((v) => !v)}
            title="Show only materials your tracked characters need"
          >
            {relevantOnly ? "Showing tracked" : "Showing all"}
          </button>
        )}
        <div className="filter-tabs">
          {["All", ...KINDS.map((k) => k.key)].map((key) => (
            <button
              key={key}
              className={kindFilter === key ? "active-filter" : ""}
              onClick={() => setKindFilter(key)}
            >
              {key === "All" ? "All" : KIND_LABEL.get(key)}
            </button>
          ))}
        </div>
        {importMsg && <span className="inv-msg">{importMsg}</span>}
      </div>

      {!data && <p className="roster-note">Loading materials…</p>}
      {data && groups.length === 0 && (
        <p className="roster-note">No materials match this filter.</p>
      )}

      {groups.map((group) => (
        <section className="inv-group" key={group.key}>
          <h3>
            {group.label}{" "}
            <span className="count-badge">{group.items.length}</span>
          </h3>
          <div className="inv-grid">
            {group.items.map((m) => {
              const inComp = compNeeded.has(m.name);
              const tracked = trackedNeeded.has(m.name);
              return (
                <div
                  className={`inv-item r${m.rarity}${
                    inComp ? " comp-card" : ""
                  }${tracked ? " tracked" : ""}`}
                  key={m.name}
                >
                  <span className="inv-icon" title={m.name}>
                    {m.icon ? (
                      <Image
                        src={iconUrl(m.icon) as string}
                        alt={m.name}
                        width={44}
                        height={44}
                      />
                    ) : (
                      <span className="mat-fallback">{m.name.slice(0, 2)}</span>
                    )}
                  </span>
                  <span className="inv-name" title={m.name}>
                    {m.name}
                  </span>
                  <input
                    className="inv-qty"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="0"
                    value={inventory?.[m.name] ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/\D/g, "");
                      setOwned(m.name, raw ? Number.parseInt(raw, 10) : null);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
