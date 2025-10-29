// src/components/graph/GraphView.js
import React from "react";

const miniBtnStyle = {
  background: "#111827",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  padding: "4px 8px",        // <-- antes era "2px 4px", un poco más grande
  fontSize: "16px",          // <-- antes 10px
  lineHeight: "1.2",         // <-- antes 1.2
  color: "var(--txt)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  // gap: "4px",
  flexShrink: 0,
  flex: "1 1 auto",
  justifyContent: "center",
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

  // display: "flex",
  // flexDirection: "column",

  width: "300px",
  minWidth: "200",
  maxWidth: "380px",
  // flex: "1 1 auto",
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
      {/* header: name + state */}
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
            fontSize: "16px",
            lineHeight: "1.2",
            maxWidth: "300px",
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

      {/* metrics */}
      <div
        style={{
          color: "var(--txt-dim)",
          fontSize: "14px",
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

      {/* truncated ports */}
      <div
        style={{
          fontSize: "14px",
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

      {/* actions */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginTop: "18px",
        }}
      >
        <button 
          style={{ ...miniBtnStyle, borderColor: "transparent" }} 
          onClick={() => onStart(ct.id)}
        >
          ▶️
        </button>
        <button 
          style={{ ...miniBtnStyle, borderColor: "transparent" }} 
          onClick={() => onStop(ct.id)}
        >
          ⏹️
        </button>
        <button 
          style={{ ...miniBtnStyle, borderColor: "transparent" }} 
          onClick={() => onRestart(ct.id)}
        >
          🔄
        </button>
        <span
          style={{
            display: "inline-block",
            width: "2px",
            height: "30px",
            background: "var(--border)",
            margin: "0 4px",
            alignSelf: "stretch",
          }}
        />
        <button 
          style={miniBtnStyle} 
          onClick={() => onOpenLogs(ct.id)}
        >
          📜
        </button>
        <button 
          style={miniBtnStyle} 
          onClick={() => onOpenShell(ct.id)}
        >
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
      {/* cards grid */}
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
