// frontend_v2/src/components/ExecModal.js
import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { runContainerCommand } from "../api";
import { FaTerminal, FaSearch, FaCopy } from "react-icons/fa";

// escapa texto para regex segura
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function ExecModal({ containerId, onClose }) {
  // ===== estado terminal =====
  const [history, setHistory] = useState([]);
  const [currentCmd, setCurrentCmd] = useState("");
  const [error, setError] = useState("");

  // flash al copiar todo el buffer
  const [flashCopy, setFlashCopy] = useState(false);

  // búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [matches, setMatches] = useState([]); // [{ lineIndex, start, end }]
  const [currentMatch, setCurrentMatch] = useState(0);

  // ===== tamaño de fuente dinámico del área de salida =====
  const [fontPx, setFontPx] = useState(() => {
    try {
      const raw = localStorage.getItem("execModalFontPx");
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n >= 8 && n <= 24) {
        return n;
      }
    } catch {
      /* ignore */
    }
    return 12; // default px
  });

  const fontMetrics = useMemo(() => {
    const normal = fontPx;
    const small = Math.round(fontPx * 0.85);
    const lh = Math.round(fontPx * 1.3);
    return { normal, small, lh };
  }, [fontPx]);

  // persistir preferencia de tamaño de fuente
  useEffect(() => {
    try {
      localStorage.setItem("execModalFontPx", String(fontPx));
    } catch {
      /* ignore */
    }
  }, [fontPx]);

  // atajos Ctrl/Cmd + / - / 0 para zoom del área de salida
  useEffect(() => {
    function onKey(e) {
      const ctrlLike = e.ctrlKey || e.metaKey;
      if (!ctrlLike) return;

      const key = e.key;
      const isPlus = key === "+" || key === "=";
      const isMinus = key === "-";
      const isReset = key === "0";

      if (isPlus || isMinus || isReset) {
        e.preventDefault(); // evita zoom global del browser
      }

      if (isPlus) {
        setFontPx((prev) => {
          const next = prev + 1;
          return next > 24 ? 24 : next;
        });
      } else if (isMinus) {
        setFontPx((prev) => {
          const next = prev - 1;
          return next < 8 ? 8 : next;
        });
      } else if (isReset) {
        setFontPx(12);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // ===== posición / tamaño persistentes =====
  function getInitialPosition() {
    try {
      const raw = localStorage.getItem("execModalPos");
      if (raw) {
        const { top, left } = JSON.parse(raw);
        if (typeof top === "number" && typeof left === "number") {
          return { top, left };
        }
      }
    } catch {
      /* ignore */
    }
    return { top: 120, left: 120 };
  }

  function getInitialSize() {
    try {
      const raw = localStorage.getItem("execModalSize");
      if (raw) {
        const { width, height } = JSON.parse(raw);
        if (typeof width === "number" && typeof height === "number") {
          return { width, height };
        }
      }
    } catch {
      /* ignore */
    }
    return { width: 600, height: 350 };
  }

  const [position, setPosition] = useState(getInitialPosition);
  const [size, setSize] = useState(getInitialSize);

  // tamaño mínimo dinámico
  const [minSize, setMinSize] = useState({
    minWidth: 400,
    minHeight: 200,
  });

  // ===== refs DOM =====
  const headerRef = useRef(null);
  const toolbarRef = useRef(null);
  const inputBarRef = useRef(null);
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  // después de ejecutar comando queremos scroll al fondo
  const stickToBottomRef = useRef(false);

  // ===== refs drag / resize =====
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const resizingRef = useRef(false);
  const resizeStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    startW: 0,
    startH: 0,
  });

  // autofocus en textarea al montar
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // ESC para cerrar
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // ===== buffer terminal renderizable =====
  // history: [{ command, stdout, stderr, returncode }]
  // terminalLines: [{ text, color, small }]
  const terminalLines = useMemo(() => {
    const lines = [];

    history.forEach((item) => {
      // comando
      lines.push({
        text: `$ ${item.command}`,
        color: "#0ff", // cyan
        small: false,
      });

      // stdout
      if (item.stdout) {
        item.stdout.split("\n").forEach((l) => {
          lines.push({
            text: l,
            color: "#0f0",
            small: false,
          });
        });
      }

      // stderr
      if (item.stderr) {
        item.stderr.split("\n").forEach((l) => {
          lines.push({
            text: l,
            color: "#f00",
            small: false,
          });
        });
      }

      // exit code
      lines.push({
        text: `exit code: ${item.returncode}`,
        color: "#888",
        small: true,
      });
    });

    if (error) {
      lines.push({
        text: `[ERROR] ${error}`,
        color: "red",
        small: false,
      });
    }

    return lines;
  }, [history, error]);

  // texto plano completo (para copiar)
  const fullPlainText = useMemo(
    () => terminalLines.map((l) => l.text).join("\n"),
    [terminalLines]
  );

  // copiar todo
  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(fullPlainText);
      setFlashCopy(true);
      setTimeout(() => {
        setFlashCopy(false);
      }, 250);
    } catch {
      /* ignore */
    }
  };

  // ejecutar comando dentro del contenedor
  const executeCommand = useCallback(async () => {
    const cmd = currentCmd.trim();
    if (!cmd) return;

    // comando local especial: clear
    if (cmd === "clear") {
      setHistory([]);
      setCurrentCmd("");
      setError("");
      setSearchTerm("");
      setMatches([]);
      setCurrentMatch(0);

      stickToBottomRef.current = true;
      return;
    }

    try {
      setError("");
      const response = await runContainerCommand(containerId, cmd);
      // backend: { stdout, stderr, returncode }
      const { stdout, stderr, returncode } = response.data;

      // luego de ejecutar queremos scrollear abajo
      stickToBottomRef.current = true;

      setHistory((prev) => [
        ...prev,
        {
          command: cmd,
          stdout: stdout || "",
          stderr: stderr || "",
          returncode,
        },
      ]);

      setCurrentCmd("");
    } catch (err) {
      setError("Failed to execute command");
      stickToBottomRef.current = true;
    }
  }, [containerId, currentCmd]);

  // Enter ejecuta, Shift+Enter = newline
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  };

  // ===== búsqueda / matches =====
  useEffect(() => {
    if (!searchTerm) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }

    const needle = escapeRegex(searchTerm);
    const re = new RegExp(needle, "gi");

    const newMatches = [];
    terminalLines.forEach((lineObj, lineIndex) => {
      const line = lineObj.text || "";
      let m;
      while ((m = re.exec(line)) !== null) {
        newMatches.push({
          lineIndex,
          start: m.index,
          end: m.index + m[0].length,
        });
      }
    });

    setMatches(newMatches);
    setCurrentMatch(0);
  }, [searchTerm, terminalLines]);

  // mapa linea -> orden global de matches en esa línea
  const matchOrderMap = useMemo(() => {
    const map = {};
    matches.forEach((m, globalIdx) => {
      if (!map[m.lineIndex]) {
        map[m.lineIndex] = [];
      }
      map[m.lineIndex].push(globalIdx);
    });
    return map;
  }, [matches]);

  // resalta texto con .highlight / .current-match
  const renderHighlightedLine = (lineIndex, text, lineColorStyle) => {
    if (!searchTerm) {
      return <span style={lineColorStyle}>{text}</span>;
    }

    const needle = escapeRegex(searchTerm);
    const regex = new RegExp(`(${needle})`, "gi");

    let localOccurrence = 0;

    return text.split(regex).map((part, j) => {
      const isCaptured = j % 2 === 1;
      if (!isCaptured) {
        return (
          <span key={j} style={lineColorStyle}>
            {part}
          </span>
        );
      } else {
        const globalIdxForThisPart =
          matchOrderMap[lineIndex]?.[localOccurrence];
        const isCurrent = globalIdxForThisPart === currentMatch;
        localOccurrence++;

        return (
          <span
            key={j}
            className={isCurrent ? "current-match" : "highlight"}
          >
            {part}
          </span>
        );
      }
    });
  };

  // navegación prev / next
  const goToMatch = (direction) => {
    if (matches.length === 0) return;
    let nextIndex;
    if (direction === "next") {
      nextIndex = (currentMatch + 1) % matches.length;
    } else {
      nextIndex = (currentMatch - 1 + matches.length) % matches.length;
    }
    setCurrentMatch(nextIndex);
  };

  // cuando cambia currentMatch, centrar visualmente esa coincidencia
  useEffect(() => {
    if (matches.length === 0 || !outputRef.current) return;
    const currentEl = outputRef.current.querySelector(".current-match");
    if (currentEl) {
      currentEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentMatch, matches]);

  // ===== drag start (mover ventana) =====
  const startDrag = (e) => {
    // sólo si clickeaste en el header
    if (e.target.closest(".logsmodal-header")) {
      draggingRef.current = true;
      dragOffsetRef.current = {
        x: e.clientX - position.left,
        y: e.clientY - position.top,
      };
      e.preventDefault();
    }
  };

  // ===== resize start (cambiar tamaño) =====
  const startResize = (e) => {
    resizingRef.current = true;
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  // ===== listeners globales mousemove/mouseup =====
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (draggingRef.current) {
        const newLeft = e.clientX - dragOffsetRef.current.x;
        const newTop = e.clientY - dragOffsetRef.current.y;
        setPosition({
          left: newLeft < 0 ? 0 : newLeft,
          top: newTop < 0 ? 0 : newTop,
        });
      } else if (resizingRef.current) {
        const dx = e.clientX - resizeStartRef.current.mouseX;
        const dy = e.clientY - resizeStartRef.current.mouseY;

        let newW = resizeStartRef.current.startW + dx;
        let newH = resizeStartRef.current.startH + dy;

        if (newW < minSize.minWidth) newW = minSize.minWidth;
        if (newH < minSize.minHeight) newH = minSize.minHeight;

        setSize({
          width: newW,
          height: newH,
        });
      }
    };

    const handleMouseUp = () => {
      const moved = draggingRef.current || resizingRef.current;

      draggingRef.current = false;
      resizingRef.current = false;

      if (moved) {
        // persistimos pos y size finales
        try {
          localStorage.setItem(
            "execModalPos",
            JSON.stringify({
              top: position.top,
              left: position.left,
            })
          );
        } catch {
          /* ignore */
        }
        try {
          localStorage.setItem(
            "execModalSize",
            JSON.stringify({
              width: size.width,
              height: size.height,
            })
          );
        } catch {
          /* ignore */ 
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [minSize, position, size]);

  // ===== recalcular minHeight dinámico =====
  // header + toolbar + input bar + ~160px buffer
  useLayoutEffect(() => {
    if (!headerRef.current || !toolbarRef.current || !inputBarRef.current) {
      return;
    }

    const hRect = headerRef.current.getBoundingClientRect();
    const tRect = toolbarRef.current.getBoundingClientRect();
    const iRect = inputBarRef.current.getBoundingClientRect();

    const calcMinHeight = hRect.height + tRect.height + iRect.height + 160;

    setMinSize((old) => ({
      ...old,
      minHeight: calcMinHeight < 200 ? 200 : Math.ceil(calcMinHeight),
    }));
  }, [currentCmd, searchTerm]);

  // ===== auto-scroll al fondo tras cada comando =====
  useLayoutEffect(() => {
    if (!outputRef.current) return;
    if (stickToBottomRef.current) {
      const el = outputRef.current;
      el.scrollTop = el.scrollHeight;
      stickToBottomRef.current = false;
    }
  }, [terminalLines, searchTerm, matches]);

  // ===== limpiar buffer =====
  const clearBuffer = () => {
    setHistory([]);
    setError("");
    setSearchTerm("");
    setMatches([]);
    setCurrentMatch(0);
    stickToBottomRef.current = true;
  };

  // ===== UI =====
  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "transparent",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      <div
        className="modal-content floating-modal logsmodal-shell"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          width: size.width,
          height: size.height,
          minWidth: minSize.minWidth,
          minHeight: minSize.minHeight,
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          background: "#2a2e36",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          color: "var(--txt)",
          pointerEvents: "auto", // <- MUY importante
          overflow: "hidden",
          boxSizing: "border-box",
          fontFamily:
            "system-ui,-apple-system,BlinkMacSystemFont,'Inter',Roboto,'Segoe UI',sans-serif",
        }}
        onMouseDown={startDrag}
      >
        {/* HEADER draggable */}
        <div
          ref={headerRef}
          className="logsmodal-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--border)",
            padding: "8px 12px",
            cursor: "move",
            userSelect: "none",
            background: "#1f2330",
            color: "var(--txt)",
            fontSize: "0.9rem",
            lineHeight: 1.2,
            flexShrink: 0,
          }}
        >
          <div
            className="logsmodal-header-left"
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <span
              className="logsmodal-title"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontWeight: 600,
                color: "var(--txt)",
              }}
            >
              <FaTerminal />
              <span>Terminal for {containerId}</span>
            </span>

            {error && (
              <span
                className="logsmodal-error"
                style={{
                  fontSize: "0.7rem",
                  color: "#ff7b7b",
                }}
              >
                {error}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="logsmodal-closebtn"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: "0.9rem",
              color: "var(--txt)",
              padding: "2px 6px",
              cursor: "pointer",
              lineHeight: 1,
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* TOOLBAR búsqueda / copy / clear */}
        <div
          ref={toolbarRef}
          className="logsmodal-toolbar"
          style={{
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            borderBottom: "1px solid var(--border)",
            background: "#222634",
            fontSize: "0.8rem",
            lineHeight: 1.2,
            flexShrink: 0,
          }}
        >
          {/* bloque búsqueda */}
          <div
            className="toolbar-section search-section"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: "transparent",
              flexShrink: 0,
              minWidth: 0,
            }}
          >
            <FaSearch
              className="search-icon"
              style={{ fontSize: "0.8rem" }}
            />
            <input
              className="search-input"
              type="text"
              placeholder="search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                borderRadius: 4,
                border: "1px solid var(--border)",
                backgroundColor: "#111827",
                color: "var(--txt)",
                fontSize: "0.8rem",
                lineHeight: "1rem",
                padding: "4px 6px",
              }}
            />
            <button
              className="nav-btn"
              onClick={() => goToMatch("prev")}
              title="Prev"
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--txt)",
                cursor: "pointer",
                fontSize: "0.7rem",
                lineHeight: "1rem",
                padding: "4px 6px",
              }}
            >
              {"<"}
            </button>
            <button
              className="nav-btn"
              onClick={() => goToMatch("next")}
              title="Next"
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--txt)",
                cursor: "pointer",
                fontSize: "0.7rem",
                lineHeight: "1rem",
                padding: "4px 6px",
              }}
            >
              {">"}
            </button>
            <span
              className="match-count"
              style={{
                fontSize: "0.7rem",
                lineHeight: "1rem",
                color: "var(--txt-dim)",
                whiteSpace: "nowrap",
              }}
            >
              {searchTerm
                ? matches.length > 0
                  ? `${currentMatch + 1} of ${matches.length}`
                  : "0 of 0"
                : ""}
            </span>
          </div>

          {/* acciones derecha */}
          <div
            className="toolbar-section toolbar-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            <button
              className="icon-btn"
              title="Copy buffer"
              onClick={handleCopyAll}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
                color: "var(--txt)",
                fontSize: "0.8rem",
                lineHeight: 1,
                padding: "4px 6px",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <FaCopy />
              <span style={{ fontSize: "0.7rem" }}>COPY</span>
            </button>

            <button
              className="icon-btn"
              title="Clear buffer"
              onClick={clearBuffer}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
                color: "var(--txt)",
                fontSize: "0.8rem",
                lineHeight: 1,
                padding: "4px 6px",
                fontWeight: 600,
              }}
            >
              CLR
            </button>
          </div>
        </div>

        {/* OUTPUT / BUFFER */}
        <pre
          ref={outputRef}
          className={"logsmodal-body" + (flashCopy ? " flash" : "")}
          style={{
            flex: "1 1 auto",
            background: "#0a0d12",
            color: "#0f0",
            padding: "12px",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
            borderTop: "1px solid #1b1f2c",
            borderBottom: "1px solid #1b1f2c",
            fontFamily: "monospace",
            fontSize: fontMetrics.normal + "px",
            lineHeight: fontMetrics.lh + "px",
            margin: 0,
          }}
        >
          {terminalLines.map((lineObj, idx) => (
            <div
              key={idx}
              style={{
                color: lineObj.color || "#0f0",
                fontSize:
                  (lineObj.small
                    ? fontMetrics.small
                    : fontMetrics.normal) + "px",
                whiteSpace: "pre-wrap",
                lineHeight: fontMetrics.lh + "px",
                fontFamily: "monospace",
              }}
            >
              {renderHighlightedLine(idx, lineObj.text || "", {
                color: lineObj.color || "#0f0",
              })}
            </div>
          ))}
        </pre>

        {/* INPUT BAR */}
        <div
          ref={inputBarRef}
          className="execmodal-inputbar"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
            backgroundColor: "#1a1a1a",
            color: "#eee",
            borderTop: "1px solid #444",
            padding: "0.5rem 0.75rem",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            lineHeight: "1.3rem",
            flexShrink: 0,
            position: "relative",
            zIndex: 1, // esta barra vive sobre el fondo
          }}
        >
          <span
            className="execmodal-prompt"
            style={{
              color: "#0ff",
              lineHeight: "1.4rem",
              fontWeight: "bold",
              fontFamily: "monospace",
            }}
          >
            $
          </span>

          <textarea
            ref={inputRef}
            className="execmodal-input"
            value={currentCmd}
            onChange={(e) => setCurrentCmd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command and press Enter… (use 'clear' to clear)"
            style={{
              flex: "1 1 auto",
              minHeight: "2.2rem",
              maxHeight: "6rem",
              backgroundColor: "#000",
              color: "#0f0",
              border: "1px solid #444",
              borderRadius: 4,
              resize: "none",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              lineHeight: "1.2rem",
              padding: "0.5rem",
              boxSizing: "border-box",
              width: "100%",
            }}
          />

          <button
            className="execmodal-runbtn"
            onClick={executeCommand}
            title="Run command"
            style={{
              background: "none",
              border: "1px solid #444",
              borderRadius: 4,
              cursor: "pointer",
              padding: "0.5rem 0.75rem",
              color: "#eee",
              fontSize: "0.8rem",
              lineHeight: 1.2,
              backgroundColor: "#222",
              height: "2.2rem",
              alignSelf: "flex-start",
              fontFamily:
                "system-ui,-apple-system,BlinkMacSystemFont,'Inter',Roboto,'Segoe UI',sans-serif",
              fontWeight: 500,
            }}
          >
            Run
          </button>
        </div>

        {/* HANDLE DE RESIZE */}
        <div
          onMouseDown={startResize}
          style={{
            position: "absolute",
            width: "14px",
            height: "14px",
            right: 0,
            bottom: 0,
            cursor: "se-resize",
            background:
              "repeating-linear-gradient(135deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 6px, rgba(0,0,0,0.2) 6px, rgba(0,0,0,0.2) 8px)",
            borderTopLeftRadius: "4px",
            borderLeft: "1px solid rgba(0,0,0,0.2)",
            borderTop: "1px solid rgba(0,0,0,0.2)",
            backgroundColor: "rgba(255,255,255,0.4)",
            boxSizing: "border-box",
            pointerEvents: "auto",
            zIndex: 2,
          }}
        />
      </div>
    </div>
  );
}
