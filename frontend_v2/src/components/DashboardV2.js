// src/components/DashboardV2.js
import React, { useEffect, useState, useCallback } from "react";
import {
  listStacks,
  getStackDetail,
  restartContainer,
  startContainer,
  stopContainer,
  registerAuthErrorCallback, // <-- new import
} from "../api";

import HeaderBar from "./layout/HeaderBar";
import SidebarStacks from "./sidebar/SidebarStacks";
import GraphView from "./graph/GraphView";
import LogsModal from "./LogsModal";
import ExecModal from "./ExecModal";
import LoginForm from "./auth/LoginForm";

export default function DashboardV2() {
  // auth state: we mirror whatever is in localStorage initially
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");

  // data
  const [stacks, setStacks] = useState([]);
  const [selectedStackId, setSelectedStackId] = useState(null);
  const [stackDetail, setStackDetail] = useState(null);

  // ui
  const [loadingStacks, setLoadingStacks] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  // modals
  const [selectedContainerId, setSelectedContainerId] = useState(null); // logs modal
  const [terminalContainerId, setTerminalContainerId] = useState(null); // exec modal

  /**
   * Centralized logout logic.
   * We use this both when the user clicks "Logout" AND when the backend
   * tells us the token is no longer valid (401/403).
   */
  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    setToken("");
    setStacks([]);
    setSelectedStackId(null);
    setStackDetail(null);
  }, []);

  /**
   * Listen for "auth error" notifications from api.js.
   * api.js will call all registered callbacks when it sees 401/403.
   *
   * This means: if the token expires, we immediately wipe local state
   * and show the login screen without requiring the user to click Logout.
   */
  useEffect(() => {
    const cb = () => {
      handleLogout();
    };
    registerAuthErrorCallback(cb);
  }, [handleLogout]);

  // LOAD STACKS after login / token change
  useEffect(() => {
    if (!token) return;
    let alive = true;

    async function load() {
      try {
        setLoadingStacks(true);
        setError("");

        const stacksArr = await listStacks();

        if (!alive) return;
        setStacks(stacksArr);
        setSelectedStackId((prev) => prev || stacksArr[0]?.stack_id || null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
      } finally {
        if (alive) setLoadingStacks(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [token]);

  // LOAD STACK DETAIL when selectedStackId changes
  useEffect(() => {
    if (!token) return;
    if (!selectedStackId) {
      setStackDetail(null);
      return;
    }

    let alive = true;

    async function loadDetail() {
      try {
        setLoadingDetail(true);
        setError("");

        const data = await getStackDetail(selectedStackId);
        if (!alive) return;
        setStackDetail(data);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
      } finally {
        if (alive) setLoadingDetail(false);
      }
    }

    loadDetail();
    return () => {
      alive = false;
    };
  }, [token, selectedStackId]);

  // modal helpers
  const openLogs = useCallback((cid) => setSelectedContainerId(cid), []);
  const openShell = useCallback((cid) => setTerminalContainerId(cid), []);

  // container actions
  const doRestart = useCallback(
    async (cid) => {
      try {
        await restartContainer(cid); // POST /api/containers/:id/restart

        // refresh the current stack detail after restart
        const data = await getStackDetail(selectedStackId);
        setStackDetail(data);
      } catch (e) {
        alert(e?.message || String(e));
      }
    },
    [selectedStackId]
  );

  const doStart = useCallback(
    async (cid) => {
      try {
        await startContainer(cid); // POST /api/containers/:id/start

        const data = await getStackDetail(selectedStackId);
        setStackDetail(data);
      } catch (e) {
        alert(e?.message || String(e));
      }
    },
    [selectedStackId]
  );

  const doStop = useCallback(
    async (cid) => {
      try {
        await stopContainer(cid); // POST /api/containers/:id/stop

        const data = await getStackDetail(selectedStackId);
        setStackDetail(data);
      } catch (e) {
        alert(e?.message || String(e));
      }
    },
    [selectedStackId]
  );

  /**
   * If there is no token, we don't render the dashboard at all.
   * We render the LoginForm instead.
   *
   * After the user logs in successfully, LoginForm calls onLoggedIn(token),
   * which stores the token and brings us back into the app.
   */
  if (!token) {
    return <LoginForm onLoggedIn={(t) => setToken(t)} />;
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        color: "var(--txt)",
        fontFamily:
          "system-ui,-apple-system,BlinkMacSystemFont,'Inter',Roboto,'Segoe UI',sans-serif",
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <HeaderBar onLogout={handleLogout} />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <SidebarStacks
          stacks={stacks}
          selectedStackId={selectedStackId}
          onSelect={setSelectedStackId}
        />

        <main
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--main)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--txt)",
                }}
              >
                {selectedStackId || "—"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--txt-dim)",
                }}
              >
                {stackDetail
                  ? `${stackDetail.summary.containers_count} containers · RAM ${stackDetail.summary.ram_total_used} / ${stackDetail.summary.ram_host_total} · CPU ${stackDetail.summary.cpu_avg}`
                  : loadingDetail
                  ? "Loading…"
                  : ""}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={{
                  background: "#111827",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--txt)",
                  padding: "6px 8px",
                  fontSize: 11,
                }}
              >
                🔄 Restart stack
              </button>
              <button
                style={{
                  background: "#111827",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--txt)",
                  padding: "6px 8px",
                  fontSize: 11,
                }}
              >
                📜 Tail all logs
              </button>
              <button
                style={{
                  background: "#111827",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--txt)",
                  padding: "6px 8px",
                  fontSize: 11,
                }}
              >
                📦 View compose
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: "#ff6b6b", fontSize: 12 }}>{error}</div>
          )}

          <GraphView
            stackDetail={stackDetail}
            onOpenLogs={openLogs}
            onOpenShell={openShell}
            onStart={doStart}
            onStop={doStop}
            onRestart={doRestart}
          />
        </main>
      </div>

      {selectedContainerId && (
        <LogsModal
          containerId={selectedContainerId}
          onClose={() => setSelectedContainerId(null)}
        />
      )}

      {terminalContainerId && (
        <ExecModal
          containerId={terminalContainerId}
          onClose={() => setTerminalContainerId(null)}
        />
      )}
    </div>
  );
}
