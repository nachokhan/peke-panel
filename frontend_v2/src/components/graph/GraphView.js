// src/components/graph/GraphView.js
import React from "react";

const miniBtnStyle = {
  background: "#111827",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  padding: "6px 8px",        // <-- antes era "2px 4px", un poco más grande
  fontSize: "14px",          // <-- antes 10px
  lineHeight: "1.2",         // <-- antes 1.2
  color: "var(--txt)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "px",
  flexShrink: 0,
};

const cardStyle = {
  background: "#111827",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  boxShadow: "0 24px 64px rgba(0,0,0,.6)",
  padding: "12px",
  color: "var(--txt)",
  fontSize: "11px",
  lineHeight: "1.4",
  display: "flex",
  flexDirection: "column",
  width: "200px",
  minWidth: "200px",
  maxWidth: "200px",
};

function StatusPill({ state }) {
  let pillBg = "rgba(61,220,132,.08)";
  let pillBorder = "rgba(61,220,132,.3)";
  let pillColor = "#3ddc84";
  let pillIcon = "🟢";

  if (state === "unhealthy") {
    pillBg = "rgba(255,184,77,.08)";
    pillBorder = "rgba(255,184,77,.3)";
    pillColor = "#ffb84d";
    pillIcon = "⚠️";
  } else if (state !== "running") {
    pillBg = "rgba(255,107,107,.08)";
    pillBorder = "rgba(255,107,107,.3)";
    pillColor = "#ff6b6b";
    pillIcon = "⛔";
  }

  return (
    <div
      style={{
        background: pillBg,
        color: pillColor,
        border: `1px solid ${pillBorder}`,
        borderRadius: "999px",
        fontSize: "10px",
        lineHeight: "1.2",
        padding: "2px 6px",
        whiteSpace: "nowrap",
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: "4px",
        flexShrink: 0,
      }}
    >
      {pillIcon} {state}
    </div>
  );
}

function ContainerCard({ ct, onOpenLogs, onOpenShell, onStart, onStop, onRestart }) {
  return (
    <div style={cardStyle}>
      {/* header: nombre + estado */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: "var(--txt)",
            wordBreak: "break-word",
            fontSize: "13px",
            lineHeight: "1.2",
            maxWidth: "130px",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden",
          }}
          title={ct.name || ct.id}
        >
          {ct.name || ct.id}
        </div>

        <StatusPill state={ct.state} />
      </div>

      {/* métricas */}
      <div
        style={{
          color: "var(--txt-dim)",
          fontSize: "11px",
          lineHeight: "1.4",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: "2px",
          columnGap: "6px",
          marginBottom: "8px",
          flexShrink: 0,
        }}
      >
        <div style={{ color: "var(--txt)" }}>CPU:</div>
        <div>{ct.cpu}</div>

        <div style={{ color: "var(--txt)" }}>RAM:</div>
        <div>{ct.ram}</div>

        <div style={{ color: "var(--txt)" }}>Up:</div>
        <div>{ct.uptime}</div>

        <div style={{ color: "var(--txt)" }}>NET:</div>
        <div>{ct.net}</div>
      </div>

      {/* puertos truncados */}
      <div
        style={{
          fontSize: "11px",
          color: "var(--txt)",
          lineHeight: "1.3",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          overflow: "hidden",
          flexShrink: 0,
        }}
        title={
          Array.isArray(ct.ports)
            ? ct.ports.join(", ")
            : ct.ports || ""
        }
      >
        <span style={{ color: "var(--txt-dim)" }}>Ports:</span>{" "}
        {Array.isArray(ct.ports)
          ? ct.ports.join(", ")
          : ct.ports || "N/A"}
      </div>

      {/* acciones */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1px",
          marginTop: "18px",
        }}
      >
        <button style={miniBtnStyle} onClick={() => onStart(ct.id)}>
          ▶
        </button>
        <button style={miniBtnStyle} onClick={() => onStop(ct.id)}>
          ⏹
        </button>
        <button style={miniBtnStyle} onClick={() => onRestart(ct.id)}>
          🔄
        </button>
        <button style={miniBtnStyle} onClick={() => onOpenLogs(ct.id)}>
          📜
        </button>
        <button style={miniBtnStyle} onClick={() => onOpenShell(ct.id)}>
          💻
        </button>
        
      </div>
    </div>
  );
}

export default function GraphView({
  stackDetail,
  onOpenLogs,
  onOpenShell,
  onStart,
  onStop,
  onRestart,
}) {
  if (!stackDetail) {
    return (
      <section
        style={{
          flex: 1,
          minHeight: 0,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0,0,0,.6)",
          color: "var(--txt-dim)",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          textAlign: "center",
        }}
      >
        Cargando…
      </section>
    );
  }

  const containers = stackDetail.containers || [];

  return (
    <section
      style={{
        flex: 1,
        minHeight: 0,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        boxShadow: "0 24px 64px rgba(0,0,0,.6)",
        padding: "16px",
        overflowY: "auto",
      }}
    >
      {/* grid de cards */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        {containers.map((ct) => (
          <ContainerCard
            key={ct.id}
            ct={ct}
            onOpenLogs={onOpenLogs}
            onOpenShell={onOpenShell}
            onStart={onStart}
            onStop={onStop}
            onRestart={onRestart}
          />
        ))}
      </div>
    </section>
  );
}
