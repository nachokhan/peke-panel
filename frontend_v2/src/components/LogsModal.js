// frontend_v2/src/components/LogsModal.js
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { getContainerLogs } from "../api";
import { FaSync, FaCopy, FaDownload, FaSearch } from "react-icons/fa";

// escapador para la regex del buscador
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function LogsModal({ containerId, onClose }) {
  // ===== state principal =====
  const [logs, setLogs] = useState("");
  const [lines, setLines] = useState(100);
  const [error, setError] = useState("");

  // flash visual al copiar
  const [flashCopy, setFlashCopy] = useState(false);

  // búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [matches, setMatches] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(0);

  // ===== tamaño de fuente dinámico del área de logs =====
  const [fontPx, setFontPx] = useState(() => {
    try {
      const raw = localStorage.getItem("logsModalFontPx");
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n >= 8 && n <= 24) {
        return n;
      }
    } catch {
      /* ignore */
    }
    return 12; // default px
  });

  // line-height derivada del tamaño actual
  const lineHeightPx = Math.round(fontPx * 1.3);

  // persistir preferencia de tamaño de fuente
  useEffect(() => {
    try {
      localStorage.setItem("logsModalFontPx", String(fontPx));
    } catch {
      /* ignore */
    }
  }, [fontPx]);

  // atajos Ctrl/Cmd + / - / 0 para zoom del área de logs
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

  // ===== posición / tamaño persistente del modal =====
  function getInitialPosition() {
    try {
      const raw = localStorage.getItem("logsModalPos");
      if (raw) {
        const { top, left } = JSON.parse(raw);
        if (typeof top === "number" && typeof left === "number") {
          return { top, left };
        }
      }
    } catch {
      /* ignore */
    }
    return { top: 80, left: 80 };
  }

  function getInitialSize() {
    try {
      const raw = localStorage.getItem("logsModalSize");
      if (raw) {
        const { width, height } = JSON.parse(raw);
        if (typeof width === "number" && typeof height === "number") {
          return { width, height };
        }
      }
    } catch {
      /* ignore */
    }
    return { width: 900, height: 480 };
  }

  const [position, setPosition] = useState(getInitialPosition);
  const [size, setSize] = useState(getInitialSize);

  // min size dinámica (height se recalcula según header/toolbar; width fijo mínimo)
  const [minSize, setMinSize] = useState({
    minWidth: 600,
    minHeight: 260,
  });

  // ===== refs DOM =====
  const headerRef = useRef(null);
  const toolbarRef = useRef(null);
  const logsContainerRef = useRef(null);

  // marca: "después del refresh hay que dejar el scroll abajo del todo"
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

  // ===== API: traer logs =====
  const fetchLogs = useCallback(async () => {
    try {
      setError("");
      const response = await getContainerLogs(containerId, lines);
      const newText = response.data.logs || "";

      // luego de renderizar estos logs queremos scrollear al fondo
      stickToBottomRef.current = true;

      setLogs(newText);
    } catch (err) {
      setError("Failed to fetch logs");
    }
  }, [containerId, lines]);

  // cargar logs al montar y cuando cambian containerId / lines
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // cerrar con ESC
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // copiar logs al clipboard
  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      setFlashCopy(true);
      setTimeout(() => {
        setFlashCopy(false);
      }, 250);
    } catch {
      /* ignore */
    }
  };

  // exportar logs a .txt
  const handleExportLogs = () => {
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${containerId}-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  // ===== búsqueda de matches =====
  useEffect(() => {
    if (!searchTerm) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }

    const needle = escapeRegex(searchTerm);
    const re = new RegExp(needle, "gi");

    const found = [];
    logs.split("\n").forEach((line, lineIndex) => {
      let m;
      while ((m = re.exec(line)) !== null) {
        found.push({
          line: lineIndex,
          start: m.index,
          end: m.index + m[0].length,
        });
      }
    });

    setMatches(found);
    setCurrentMatch(0);
  }, [searchTerm, logs]);

  // cuando cambia currentMatch, si hay búsqueda activa, centrar el match visible
  useEffect(() => {
    if (matches.length === 0 || !logsContainerRef.current) return;

    const el = logsContainerRef.current.querySelector(".current-match");
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentMatch, matches]);

  // navega entre coincidencias
  const goToMatch = (dir) => {
    if (matches.length === 0) return;
    if (dir === "next") {
      setCurrentMatch((i) => (i + 1) % matches.length);
    } else {
      setCurrentMatch((i) => (i - 1 + matches.length) % matches.length);
    }
  };

  // pintar logs con highlight de matches
  const renderHighlightedLogs = () => {
    if (!searchTerm) {
      return logs.split("\n").map((line, i) => (
        <span key={i}>
          {line}
          <br />
        </span>
      ));
    }

    const needle = escapeRegex(searchTerm);
    const re = new RegExp(`(${needle})`, "gi");
    let globalIdx = 0;

    return logs.split("\n").map((line, lineIdx) => {
      const parts = line.split(re); // incluye capturas
      return (
        <span key={lineIdx}>
          {parts.map((chunk, j) => {
            const isMatch = j % 2 === 1;
            if (!isMatch) {
              return <span key={j}>{chunk}</span>;
            }
            const active = globalIdx === currentMatch;
            const node = (
              <span
                key={j}
                className={active ? "current-match" : "highlight"}
              >
                {chunk}
              </span>
            );
            globalIdx += 1;
            return node;
          })}
          <br />
        </span>
      );
    });
  };

  // ===== drag start =====
  const startDrag = (e) => {
    if (e.target.closest(".logsmodal-header")) {
      draggingRef.current = true;
      dragOffsetRef.current = {
        x: e.clientX - position.left,
        y: e.clientY - position.top,
      };
      e.preventDefault();
    }
  };

  // ===== resize start =====
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

  // ===== mousemove / mouseup global para drag+resize =====
  useEffect(() => {
    const onMove = (e) => {
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

    const onUp = () => {
      const moved = draggingRef.current || resizingRef.current;

      draggingRef.current = false;
      resizingRef.current = false;

      if (moved) {
        // persistir posición/tamaño
        try {
          localStorage.setItem(
            "logsModalPos",
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
            "logsModalSize",
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

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minSize, position, size]);

  // ===== recalcular minHeight segun header + toolbar =====
  useLayoutEffect(() => {
    if (!headerRef.current || !toolbarRef.current) return;
    const h = headerRef.current.getBoundingClientRect().height;
    const t = toolbarRef.current.getBoundingClientRect().height;
    const calc = h + t + 180; // body mínimo
    setMinSize((old) => ({
      ...old,
      minHeight: calc < 260 ? 260 : Math.ceil(calc),
    }));
  }, [lines, searchTerm]);

  // ===== pegar scroll al fondo DESPUÉS de cada refresh =====
  useLayoutEffect(() => {
    if (!logsContainerRef.current) return;

    if (stickToBottomRef.current) {
      const el = logsContainerRef.current;
      el.scrollTop = el.scrollHeight;
      stickToBottomRef.current = false;
    }
  }, [logs, searchTerm, matches]);

  // ===== opciones de cantidad de líneas =====
  const lineOptions = [100, 500, 1000, 5000];

  // ===== render =====
  return (
    <div className="modal-overlay">
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
        }}
        onMouseDown={startDrag}
      >
        {/* HEADER (draggable) */}
        <div ref={headerRef} className="logsmodal-header">
          <div className="logsmodal-header-left">
            <span className="logsmodal-title">Logs for {containerId}</span>
            {error && <span className="logsmodal-error">{error}</span>}
          </div>
          <button
            onClick={onClose}
            className="logsmodal-closebtn"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* TOOLBAR */}
        <div ref={toolbarRef} className="logsmodal-toolbar">
          {/* Lines selector */}
          <div className="toolbar-section lines-section">
            <span className="lines-label">Lines:</span>
            {lineOptions.map((opt) => (
              <button
                key={opt}
                className={"lines-opt" + (lines === opt ? " active" : "")}
                onClick={() => setLines(opt)}
              >
                {opt}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="toolbar-section search-section">
            <FaSearch className="search-icon" />
            <input
              className="search-input"
              type="text"
              placeholder="search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              className="nav-btn"
              onClick={() => goToMatch("prev")}
              title="Prev"
            >
              {"<"}
            </button>
            <button
              className="nav-btn"
              onClick={() => goToMatch("next")}
              title="Next"
            >
              {">"}
            </button>
            <span className="match-count">
              {searchTerm
                ? matches.length > 0
                  ? `${currentMatch + 1} of ${matches.length}`
                  : "0 of 0"
                : ""}
            </span>
          </div>

          {/* Actions */}
          <div className="toolbar-section toolbar-actions">
            <button
              className="icon-btn"
              title="Refresh"
              onClick={fetchLogs}
            >
              <FaSync />
            </button>
            <button
              className="icon-btn"
              title="Copy"
              onClick={handleCopyLogs}
            >
              <FaCopy />
            </button>
            <button
              className="icon-btn"
              title="Download"
              onClick={handleExportLogs}
            >
              <FaDownload />
            </button>
          </div>
        </div>

        {/* BODY (terminal-like output) */}
        <pre
          ref={logsContainerRef}
          className={"logsmodal-body" + (flashCopy ? " flash" : "")}
          style={{
            // override de estilos base para poder escalar fuente
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
            fontSize: fontPx + "px",
            lineHeight: lineHeightPx + "px",
            margin: 0,
          }}
        >
          {renderHighlightedLogs()}
        </pre>

        {/* RESIZE HANDLE */}
        <div
          className="logsmodal-resize-handle"
          onMouseDown={startResize}
        />
      </div>
    </div>
  );
}
