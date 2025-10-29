import React from "react";

export default function SidebarStacks({
  stacks,
  selectedStackId,
  onSelect,
  runtimeMap, 
}) {
  // helper: treat "N/A", null, undefined, "-" as "not present"
  function isPresent(v) {
    return (
      v !== undefined &&
      v !== null &&
      v !== "N/A" &&
      v !== "-" &&
      v !== ""
    );
  }

  return (
    <aside
      style={{
        width: "320px",
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

        // ---- Build RAM label
        // Prefer "<used>/<host>" if both exist and are meaningful.
        // Otherwise, fall back to st.ram_total if provided.
        // If nothing meaningful, ramLabel stays null -> we won't render the chip.
        let ramLabel = null;
        if (isPresent(st.ram_total_used) && isPresent(st.ram_host_total)) {
          ramLabel = `${st.ram_total_used}/${st.ram_host_total}`;
        } else if (isPresent(st.ram_total)) {
          ramLabel = `${st.ram_total}`;
        }

        // ---- Build CPU label
        // Prefer avg; fallback to total; else null (chip not rendered).
        let cpuLabel = null;
        if (isPresent(st.cpu_avg)) {
          cpuLabel = `${st.cpu_avg}`;
        } else if (isPresent(st.cpu_total)) {
          cpuLabel = `${st.cpu_total}`;
        }

        // runtime info for this stack, if we have it
        const runCount = runtimeMap?.[st.stack_id]?.runCount || 0;
        const stopCount = runtimeMap?.[st.stack_id]?.stopCount || 0;

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
              fontSize: "15px",
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
                  fontSize: "12px",
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
              {/* RAM chip: render only if we actually have data */}
              {ramLabel && (
                <div
                  style={{
                    display: "inline-block",
                    background: "#1f2937",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "2px 4px",
                    margin: "1px 2px 0 0",
                    fontSize: "12px",
                    lineHeight: "1.2",
                    color: "var(--txt-dim)",
                  }}
                >
                  RAM: {ramLabel}
                </div>
              )}

              {/* CPU chip: render only if we actually have data */}
              {cpuLabel && (
                <div
                  style={{
                    display: "inline-block",
                    background: "#1f2937",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "2px 4px",
                    margin: "1px 2px 0 0",
                    fontSize: "12px",
                    lineHeight: "1.2",
                    color: "var(--txt-dim)",
                  }}
                >
                  CPU: ≈ {st.cpu_avg} /ctr
                </div>
              )}

              <div style={{ marginTop: "4px", fontSize: "12px" }}>
                Longest up: {st.longest_uptime || "—"}
              </div>

              
              <div
                style={{
                  marginTop: "6px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px",
                  lineHeight: 1,
                }}
              >
                {/* green dots for running */}
                {Array.from({ length: runCount }).map((_, idx) => (
                  <span
                    key={`g${idx}`}
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "999px",
                      background: "#3ddc84",
                      border: "1px solid rgba(61,220,132,.5)",
                      display: "inline-block",
                    }}
                  />
                ))}

                {/* red dots for stopped */}
                {Array.from({ length: stopCount }).map((_, idx) => (
                  <span
                    key={`r${idx}`}
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "999px",
                      background: "#ff6b6b",
                      border: "1px solid rgba(255,107,107,.5)",
                      display: "inline-block",
                    }}
                  />
                ))}
              </div>

            </div>
          </div>
        );
      })}
    </aside>
  );
}
