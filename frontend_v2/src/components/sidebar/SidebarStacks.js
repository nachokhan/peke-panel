
import React from "react";

export default function SidebarStacks({ stacks, selectedStackId, onSelect }) {
  return (
    <aside
      style={{
        width: "240px",
        background: "var(--side)",
        borderRight: "1px solid var(--border)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        overflowY: "auto",
      }}
    >
      {stacks.map((st) => {
        const active = st.stack_id === selectedStackId;
        return (
          <div
            key={st.stack_id}
            style={{
              background: active ? "var(--main)" : "#111827",
              border: active
                ? "1px solid var(--ok)"
                : "1px solid var(--border)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "12px",
              lineHeight: "1.4",
              cursor: "pointer",
              color: "var(--txt)",
              boxShadow: active
                ? "0 24px 64px rgba(0,0,0,.6)"
                : "none",
            }}
            onClick={() => onSelect(st.stack_id)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--txt)",
                  wordBreak: "break-word",
                }}
              >
                {st.display_name || st.stack_id}
              </div>
              <div
                style={{
                  background: "rgba(61,220,132,.08)",
                  color: "#3ddc84",
                  border: "1px solid rgba(61,220,132,.3)",
                  borderRadius: "999px",
                  fontSize: "10px",
                  lineHeight: "1.2",
                  padding: "2px 6px",
                  whiteSpace: "nowrap",
                  fontWeight: 500,
                }}
              >
                🟢 {st.containers_count} ctrs
              </div>
            </div>

            <div
              style={{
                marginTop: "6px",
                color: "var(--txt-dim)",
                fontSize: "11px",
                lineHeight: "1.4",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  background: "#1f2937",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "2px 4px",
                  margin: "1px 2px 0 0",
                  fontSize: "10px",
                  lineHeight: "1.2",
                  color: "var(--txt-dim)",
                }}
              >
                RAM {st.ram_total_used}/{st.ram_host_total}
              </div>

              <div
                style={{
                  display: "inline-block",
                  background: "#1f2937",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "2px 4px",
                  margin: "1px 2px 0 0",
                  fontSize: "10px",
                  lineHeight: "1.2",
                  color: "var(--txt-dim)",
                }}
              >
                CPU {st.cpu_avg}
              </div>

              <div style={{ marginTop: "4px" }}>
                Longest up: {st.longest_uptime}
              </div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
