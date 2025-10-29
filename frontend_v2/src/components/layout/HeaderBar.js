
import React from "react";

export default function HeaderBar({ onLogout }){
  return (
    <header
      style={{
        padding: "12px 16px",
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
      }}
    >
      <div>
        <div
          style={{
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            color: "var(--txt)",
            fontSize: "16px",
            lineHeight: 1.2,
          }}
        >
          <span>Docker Compose Stacks</span>
          <span
            style={{
              fontSize: 12,
              padding: "2px 6px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "#0b0e14",
              color: "#9da3b5",
              lineHeight: 1.2,
            }}
          >
            V2
          </span>
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--txt-dim)",
            marginTop: 4,
          }}
        >
          Online viewer for your dockerized services
        </div>
      </div>

      <button
        onClick={onLogout}
        style={{
          background: "#111827",
          border: "1px solid var(--border)",
          color: "var(--txt)",
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Logout
      </button>
    </header>
  );
}
