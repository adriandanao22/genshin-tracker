"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CharacterDetail,
  RosterCharacter,
} from "@/lib/hoyolab-game-record";
import { loadPriority, savePriority } from "@/lib/priority";
import {
  hydrateUserData,
  syncPriority,
  pushUserData,
} from "@/lib/user-sync";
import {
  loadActiveComp,
  saveActiveComp,
  type ActiveComp,
} from "@/lib/active-comp";
import { CharacterDetailModal } from "./components/character-detail-modal";
import { BuildGuidesPage } from "./components/build-guides-page";
import { TeamPlannerPage } from "./components/team-planner-page";
import { LineupsPanel } from "./components/lineups-panel";
import { OverviewDashboard } from "./components/overview-dashboard";
import { RosterWall } from "./components/roster-wall";

type Player = {
  name: string;
  uid: string;
  server: string;
  level: number;
  primogems: number;
  updated: string;
};

type GeetestChallenge = {
  session_id: string;
  gt: string;
  challenge: string;
  new_captcha: number;
};

type GeetestValidate = {
  geetest_challenge: string;
  geetest_validate: string;
  geetest_seccode: string;
};

type GeetestInstance = {
  onReady: (callback: () => void) => void;
  onSuccess: (callback: () => void) => void;
  onError: (callback: () => void) => void;
  onClose: (callback: () => void) => void;
  verify: () => void;
  getValidate: () => GeetestValidate;
  destroy?: () => void;
};

declare global {
  interface Window {
    initGeetest?: (
      params: Record<string, unknown>,
      callback: (instance: GeetestInstance) => void,
    ) => void;
  }
}

const GEETEST_SCRIPT = "https://static.geetest.com/static/js/gt.0.5.0.js";

function loadGeetestScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.initGeetest) return resolve();
    const existing = document.querySelector(`script[src="${GEETEST_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("The captcha script could not be loaded.")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = GEETEST_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("The captcha script could not be loaded."));
    document.head.appendChild(script);
  });
}

function getDeviceId() {
  try {
    const key = "orbital_hoyolab_device_id";
    let value = localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

const initialPlayer: Player = {
  name: "Asteria",
  uid: "708421963",
  server: "America",
  level: 60,
  primogems: 1240,
  updated: "3 min ago",
};

export default function Home() {
  const [player, setPlayer] = useState(initialPlayer);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connectionMode, setConnectionMode] = useState<"hoyolab" | "manual">(
    "hoyolab",
  );
  const [connectionState, setConnectionState] = useState<
    "idle" | "connecting" | "captcha" | "error"
  >("idle");
  const [connectionError, setConnectionError] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [cookieForm, setCookieForm] = useState({ ltuid: "", ltoken: "" });
  const [roster, setRoster] = useState<RosterCharacter[] | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [priorityIds, setPriorityIds] = useState<number[]>([]);
  const [activeComp, setActiveComp] = useState<ActiveComp | null>(null);
  const [plansVersion, setPlansVersion] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [characterDetail, setCharacterDetail] =
    useState<CharacterDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const avatarInitials = useMemo(
    () => player.name.slice(0, 2).toUpperCase() || "??",
    [player.name],
  );

  const applyPlayer = useCallback((incoming: Partial<Player>) => {
    setPlayer((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(incoming)) {
        if (value !== null && value !== undefined)
          (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
    setConnected(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hoyolab/session")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.player) applyPlayer(data.player);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applyPlayer]);

  useEffect(() => {
    // Roster state is reset in disconnect(); this only loads on connect.
    if (!connected) return;
    let cancelled = false;
    fetch("/api/hoyolab/roster")
      .then(async (response) => ({
        ok: response.ok,
        data: await response.json(),
      }))
      .then(async ({ ok, data }) => {
        if (cancelled) return;
        if (!ok)
          throw new Error(data.error || "Could not load your roster.");
        setRoster(data.characters);
        // Pull any cloud-synced plans/priority into localStorage first.
        await hydrateUserData(player.uid);
        if (cancelled) return;
        setPriorityIds(loadPriority(player.uid));
        setActiveComp(loadActiveComp(player.uid));
        setRosterError("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRosterError(
          error instanceof Error
            ? error.message
            : "Could not load your roster.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [connected, player.uid]);

  function togglePriority(characterId: number) {
    setPriorityIds((current) => {
      const next = current.includes(characterId)
        ? current.filter((id) => id !== characterId)
        : [...current, characterId];
      savePriority(player.uid, next);
      syncPriority(next);
      return next;
    });
  }

  function chooseActiveComp(comp: ActiveComp | null) {
    // Clearing (null) or re-picking the active comp turns it off.
    const turningOff = comp === null || activeComp?.lineupId === comp?.lineupId;

    // Start from current priority minus whatever the outgoing comp had pinned,
    // so switching/clearing removes its pins but leaves your manual pins alone.
    let nextPriority = priorityIds;
    const prevPinned = activeComp?.pinnedIds ?? [];
    if (prevPinned.length > 0)
      nextPriority = nextPriority.filter((id) => !prevPinned.includes(id));

    let nextComp: ActiveComp | null = null;
    if (!turningOff && comp) {
      // Pin the comp's owned members that aren't already pinned, and remember
      // exactly which ids we added so we can undo them later.
      const rosterIds = new Set((roster ?? []).map((c) => c.id));
      const added = comp.members
        .map((m) => m.id)
        .filter((id) => rosterIds.has(id) && !nextPriority.includes(id));
      nextComp = { ...comp, pinnedIds: added };
      nextPriority = [...nextPriority, ...added];
    }

    setActiveComp(nextComp);
    saveActiveComp(player.uid, nextComp);
    setPriorityIds(nextPriority);
    savePriority(player.uid, nextPriority);

    // Persist both in ONE write so they can never desync (an earlier bug left
    // priority pins saved while their active_comp link failed to save).
    pushUserData({ priority: nextPriority, activeComp: nextComp });
  }

  async function openCharacter(characterId: number) {
    setDetailOpen(true);
    setCharacterDetail(null);
    setDetailError("");
    try {
      const response = await fetch(`/api/hoyolab/roster/${characterId}`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load this character.");
      setCharacterDetail(data.character);
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : "Could not load this character.",
      );
    }
  }

  function failConnection(error: unknown) {
    setConnectionState("error");
    setConnectionError(
      error instanceof Error ? error.message : "Could not connect to HoYoLAB.",
    );
  }

  function completeConnection(incoming: Partial<Player>) {
    applyPlayer(incoming);
    setConnectionOpen(false);
    setConnectionState("idle");
    setLoginForm({ email: "", password: "" });
    setCookieForm({ ltuid: "", ltoken: "" });
  }

  function solveCaptcha(captcha: GeetestChallenge) {
    setConnectionState("captcha");
    loadGeetestScript()
      .then(() => {
        if (!window.initGeetest)
          throw new Error("The captcha script could not be loaded.");
        window.initGeetest(
          {
            gt: captcha.gt,
            challenge: captcha.challenge,
            new_captcha: captcha.new_captcha,
            offline: false,
            product: "bind",
            api_server: "api-na.geetest.com",
            https: true,
            lang: "en",
          },
          (instance) => {
            instance.onReady(() => instance.verify());
            instance.onSuccess(() => {
              submitLogin({
                session_id: captcha.session_id,
                ...instance.getValidate(),
              });
              instance.destroy?.();
            });
            instance.onError(() =>
              failConnection(
                new Error("The captcha could not be verified. Try again."),
              ),
            );
            instance.onClose(() => setConnectionState("idle"));
          },
        );
      })
      .catch(failConnection);
  }

  async function submitLogin(
    mmtResult?: GeetestValidate & { session_id: string },
  ) {
    setConnectionState("connecting");
    setConnectionError("");
    try {
      const response = await fetch("/api/hoyolab/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
          deviceId: getDeviceId(),
          mmtResult,
        }),
      });
      const data = await response.json();
      if (response.status === 428 && data.captcha) {
        solveCaptcha(data.captcha);
        return;
      }
      if (!response.ok)
        throw new Error(data.error || "Could not sign in to HoYoLAB.");
      completeConnection(data.player);
    } catch (error) {
      failConnection(error);
    }
  }

  async function submitCookies() {
    setConnectionState("connecting");
    setConnectionError("");
    try {
      const response = await fetch("/api/hoyolab/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cookieForm),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not connect to HoYoLAB.");
      completeConnection(data.player);
    } catch (error) {
      failConnection(error);
    }
  }

  function connectHoyoLab(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connectionMode === "hoyolab") submitLogin();
    else submitCookies();
  }

  async function disconnect() {
    try {
      await fetch("/api/hoyolab/session", { method: "DELETE" });
    } catch {}
    setPlayer(initialPlayer);
    setConnected(false);
    setConnectionOpen(false);
    setConnectionState("idle");
    setRoster(null);
    setRosterError("");
    setPriorityIds([]);
    setActiveComp(null);
    setDetailOpen(false);
    setCharacterDetail(null);
  }

  const busy =
    connectionState === "connecting" || connectionState === "captcha";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <span>
            ORBITAL
            <br />
            <b>ATLAS</b>
          </span>
        </div>
        <div className="workspace-label">PLAYER WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {["Overview", "My roster", "Build guides", "Teams"].map(
            (tab) => (
              <button
                className={`nav-item ${activeTab === tab ? "is-active" : ""}`}
                key={tab}
                onClick={() => setActiveTab(tab)}
              >
                <span className="nav-dot" />
                {tab}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">NEXT SYNC</span>
          <strong>HoYoLAB connection</strong>
          <p>
            {connected
              ? `Signed in as ${player.name} · UID ${player.uid}.`
              : "Sign in with HoYoLAB to make every recommendation personal."}
          </p>
          <button
            className="link-button"
            onClick={() => setConnectionOpen(true)}
          >
            Manage connection <span>↗</span>
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" />
          {connected ? "HoYoLAB linked" : "Local preview mode"}{" "}
          <span>v0.1</span>
        </div>
      </aside>
      <section className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">{activeTab.toUpperCase()}</span>
            <h1>Good evening, {player.name}</h1>
          </div>
          <div className="topbar-actions">
            <span className="sync-status">
              <span className="status-dot" />
              {connected ? `Synced ${player.updated}` : "Preview data"}
            </span>
            <button
              className="avatar"
              onClick={() => setConnectionOpen(true)}
              aria-label="Open HoYoLAB connection"
            >
              {avatarInitials}
            </button>
          </div>
        </header>
        {activeTab === "My roster" && (
          <div className="roster-tab">
            <RosterWall
              roster={roster}
              connected={connected}
              error={rosterError}
              priorityIds={priorityIds}
              onOpen={openCharacter}
              onTogglePriority={togglePriority}
              onConnect={() => setConnectionOpen(true)}
            />
            <LineupsPanel roster={roster} connected={connected} />
          </div>
        )}
        {activeTab === "Build guides" && (
          <BuildGuidesPage
            roster={roster}
            connected={connected}
            priorityIds={priorityIds}
            onOpen={openCharacter}
          />
        )}
        {activeTab === "Teams" && (
          <TeamPlannerPage
            roster={roster}
            connected={connected}
            priorityIds={priorityIds}
            activeComp={activeComp}
            onChooseComp={chooseActiveComp}
            onOpen={openCharacter}
            onConnect={() => setConnectionOpen(true)}
          />
        )}
        {activeTab === "Overview" && (
          <OverviewDashboard
            uid={player.uid}
            playerName={player.name}
            server={player.server}
            roster={roster}
            connected={connected}
            priorityIds={priorityIds}
            plansVersion={plansVersion}
            onOpen={openCharacter}
            onManagePriority={() => setActiveTab("My roster")}
            onConnect={() => setConnectionOpen(true)}
          />
        )}
      </section>
      {connectionOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget &&
            !busy &&
            setConnectionOpen(false)
          }
        >
          <section
            className="connection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
          >
            <button
              className="modal-close"
              onClick={() => setConnectionOpen(false)}
              aria-label="Close connection dialog"
            >
              ×
            </button>
            <span className="eyebrow coral-text">SECURE PLAYER SYNC</span>
            <h2 id="connection-title">Connect HoYoLAB</h2>
            {connected ? (
              <>
                <p className="modal-intro">
                  Connected as <b>{player.name}</b> — UID {player.uid} on the{" "}
                  {player.server} server.
                </p>
                <button className="primary-button" onClick={disconnect}>
                  Disconnect <span>×</span>
                </button>
                <p className="privacy-note">
                  Disconnecting removes the encrypted session from this
                  browser. You can revoke access from HoYoLAB at any time.
                </p>
              </>
            ) : (
              <>
                <p className="modal-intro">
                  {connectionMode === "hoyolab"
                    ? "Sign in with your HoYoLAB account. Your password is only forwarded to HoYoLAB for login and never stored."
                    : "Paste your HoYoLAB cookies. They are verified server-side and stored only in an encrypted HTTP-only session."}
                </p>
                <div className="filter-tabs mode-tabs">
                  <button
                    type="button"
                    className={
                      connectionMode === "hoyolab" ? "active-filter" : ""
                    }
                    onClick={() => setConnectionMode("hoyolab")}
                  >
                    Login via HoYoLAB
                  </button>
                  <button
                    type="button"
                    className={
                      connectionMode === "manual" ? "active-filter" : ""
                    }
                    onClick={() => setConnectionMode("manual")}
                  >
                    Manual cookies
                  </button>
                </div>
                <form onSubmit={connectHoyoLab} className="connection-form">
                  {connectionMode === "hoyolab" ? (
                    <>
                      <label className="full-width">
                        HoYoLAB email
                        <input
                          required
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          value={loginForm.email}
                          onChange={(event) =>
                            setLoginForm({
                              ...loginForm,
                              email: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="full-width">
                        Password
                        <input
                          required
                          type="password"
                          autoComplete="current-password"
                          placeholder="Your HoYoLAB password"
                          value={loginForm.password}
                          onChange={(event) =>
                            setLoginForm({
                              ...loginForm,
                              password: event.target.value,
                            })
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="full-width">
                        ltuid_v2
                        <input
                          required
                          type="password"
                          autoComplete="off"
                          placeholder="Paste cookie value"
                          value={cookieForm.ltuid}
                          onChange={(event) =>
                            setCookieForm({
                              ...cookieForm,
                              ltuid: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="full-width">
                        ltoken_v2
                        <input
                          required
                          type="password"
                          autoComplete="off"
                          placeholder="Paste cookie value"
                          value={cookieForm.ltoken}
                          onChange={(event) =>
                            setCookieForm({
                              ...cookieForm,
                              ltoken: event.target.value,
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  {connectionState === "captcha" && (
                    <p className="form-hint" role="status">
                      HoYoLAB is asking for a quick captcha — solve it in the
                      popup to continue.
                    </p>
                  )}
                  {connectionState === "error" && (
                    <p className="form-error" role="alert">
                      {connectionError}
                    </p>
                  )}
                  <button className="primary-button form-submit" disabled={busy}>
                    {connectionState === "connecting"
                      ? "Checking HoYoLAB..."
                      : connectionState === "captcha"
                        ? "Waiting for captcha..."
                        : connectionMode === "hoyolab"
                          ? "Sign in and connect"
                          : "Verify and connect"}
                    <span>→</span>
                  </button>
                </form>
                <p className="privacy-note">
                  {connectionMode === "hoyolab"
                    ? "Your UID and server are detected automatically. Only the login cookies HoYoLAB returns are kept, encrypted, on this browser."
                    : "Never share these values in chat or screenshots. You can revoke them from HoYoLAB at any time."}
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {detailOpen && (
        <CharacterDetailModal
          uid={player.uid}
          detail={characterDetail}
          ownedIds={roster ? roster.map((c) => c.id) : []}
          ownedWeapons={
            roster
              ? roster
                  .filter((c) => c.weapon)
                  .map((c) => ({
                    name: c.weapon!.name,
                    refinement: c.weapon!.refinement,
                    holder: c.name,
                  }))
              : []
          }
          activeComp={activeComp}
          error={detailError}
          onClose={() => {
            setDetailOpen(false);
            setCharacterDetail(null);
            setDetailError("");
            // Plans may have changed in the modal — refresh Overview figures.
            setPlansVersion((version) => version + 1);
          }}
        />
      )}
    </main>
  );
}
