// src/components/ExecModal.js
import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
} from 'react';
import { runContainerCommand } from '../api';
import { FaTerminal, FaSearch } from 'react-icons/fa';

const ExecModal = ({ containerId, onClose }) => {
  // historial de la pseudo-terminal
  const [history, setHistory] = useState([]);

  // comando actual tipeándose
  const [currentCmd, setCurrentCmd] = useState('');

  // error global (de request al backend)
  const [error, setError] = useState('');

  // búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [matches, setMatches] = useState([]); // [{ lineIndex, start, end }, ...] en orden global
  const [currentMatch, setCurrentMatch] = useState(0);

  // posición / tamaño persistente del modal
  const getInitialPosition = () => {
    try {
      const raw = localStorage.getItem('execModalPos');
      if (!raw) {
        return { top: 120, left: 120 };
      }
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.top === 'number' &&
        typeof parsed.left === 'number'
      ) {
        return { top: parsed.top, left: parsed.left };
      }
      return { top: 120, left: 120 };
    } catch {
      return { top: 120, left: 120 };
    }
  };

  const getInitialSize = () => {
    try {
      const raw = localStorage.getItem('execModalSize');
      if (!raw) {
        return { width: 600, height: 350 };
      }
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.width === 'number' &&
        typeof parsed.height === 'number'
      ) {
        return { width: parsed.width, height: parsed.height };
      }
      return { width: 600, height: 350 };
    } catch {
      return { width: 600, height: 350 };
    }
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [size, setSize] = useState(getInitialSize);

  // min size dinámico
  const [minSize, setMinSize] = useState({ minWidth: 400, minHeight: 200 });

  // refs para drag/resize
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const resizingRef = useRef(false);
  const resizeStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    startW: 0,
    startH: 0,
  });

  // refs DOM
  const headerRef = useRef(null);
  const toolbarRef = useRef(null);
  const inputBarRef = useRef(null);
  const outputRef = useRef(null);
  const inputRef = useRef(null); // textarea del comando

  // autofocus al abrir
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // autoscroll al fondo cuando cambia el historial
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  // cerrar con ESC
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // ejecutar comando
  const executeCommand = async () => {
    const cmd = currentCmd.trim();
    if (!cmd) return;

    // comando especial local: clear
    if (cmd === 'clear') {
      setHistory([]);
      setCurrentCmd('');
      setError('');
      // también limpiamos búsqueda porque el buffer cambió
      setSearchTerm('');
      setMatches([]);
      setCurrentMatch(0);
      return;
    }

    try {
      setError('');
      const response = await runContainerCommand(containerId, cmd);
      // backend esperado:
      // { stdout: "...", stderr: "...", returncode: <int> }
      const { stdout, stderr, returncode } = response.data;

      setHistory((prev) => [
        ...prev,
        {
          command: cmd,
          stdout: stdout || '',
          stderr: stderr || '',
          returncode,
        },
      ]);

      setCurrentCmd('');
    } catch (err) {
      setError('Failed to execute command');
    }
  };

  // Enter ejecuta, Shift+Enter = newline
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  };

  // ---- Representación “line-based” del buffer visible en la terminal ----
  // Esto lo memorizamos para que NO cambie de identidad en cada render
  // (sólo cambia si cambian history o error).
  const terminalLines = useMemo(() => {
    const lines = [];

    history.forEach((item) => {
      // línea del comando (cyan)
      lines.push({ text: `$ ${item.command}`, color: '#0ff', small: false });

      // stdout (verde)
      if (item.stdout) {
        item.stdout.split('\n').forEach((l) => {
          lines.push({ text: l, color: '#0f0', small: false });
        });
      }

      // stderr (rojo)
      if (item.stderr) {
        item.stderr.split('\n').forEach((l) => {
          lines.push({ text: l, color: '#f00', small: false });
        });
      }

      // exit code (gris)
      lines.push({
        text: `exit code: ${item.returncode}`,
        color: '#888',
        small: true,
      });
    });

    if (error) {
      lines.push({
        text: `[ERROR] ${error}`,
        color: 'red',
        small: false,
      });
    }

    return lines;
  }, [history, error]);

  // --- Recalcular matches cuando cambia searchTerm o cambia el contenido terminalLines ---
  useEffect(() => {
    if (!searchTerm) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }

    const regex = new RegExp(searchTerm, 'gi');
    const newMatches = [];

    terminalLines.forEach((lineObj, lineIndex) => {
      const line = lineObj.text || '';
      let match;
      while ((match = regex.exec(line)) !== null) {
        newMatches.push({
          lineIndex,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    });

    setMatches(newMatches);
    setCurrentMatch(0);
  }, [searchTerm, terminalLines]);

  // --- matchOrderMap: para cada línea, lista de índices globales de matches ---
  // Ej:
  // matches = [
  //   { lineIndex: 4, ... }, // global 0
  //   { lineIndex: 4, ... }, // global 1
  //   { lineIndex: 7, ... }, // global 2
  // ]
  // matchOrderMap[4] = [0,1]
  // matchOrderMap[7] = [2]
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

  // cuando currentMatch cambia, scrollear al match activo
  useEffect(() => {
    if (matches.length > 0 && outputRef.current) {
      const currentMatchElement =
        outputRef.current.querySelector('.current-match');
      if (currentMatchElement) {
        currentMatchElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentMatch, matches]);

  // navegación prev/next
  const goToMatch = (direction) => {
    if (matches.length === 0) return;
    let nextMatch;
    if (direction === 'next') {
      nextMatch = (currentMatch + 1) % matches.length;
    } else {
      nextMatch = (currentMatch - 1 + matches.length) % matches.length;
    }
    setCurrentMatch(nextMatch);
  };

  // resaltar una línea con los spans .highlight / .current-match
  const renderHighlightedLine = (lineIndex, text, lineColorStyle) => {
    if (!searchTerm) {
      return <span style={lineColorStyle}>{text}</span>;
    }

    const regex = new RegExp(`(${searchTerm})`, 'gi');

    // cuántas coincidencias locales vamos contando en ESTA línea
    let localOccurrence = 0;

    return text.split(regex).map((part, j) => {
      const isCaptured = j % 2 === 1; // impares = match
      if (!isCaptured) {
        // chunk sin match
        return (
          <span key={j} style={lineColorStyle}>
            {part}
          </span>
        );
      } else {
        // este chunk SÍ es una coincidencia
        const globalIdxForThisPart =
          matchOrderMap[lineIndex]?.[localOccurrence];

        const isCurrent = globalIdxForThisPart === currentMatch;
        localOccurrence++;

        return (
          <span
            key={j}
            className={isCurrent ? 'current-match' : 'highlight'}
          >
            {part}
          </span>
        );
      }
    });
  };

  // drag start
  const onMouseDownDrag = (e) => {
    if (e.target.closest('.modal-header')) {
      draggingRef.current = true;
      dragOffsetRef.current = {
        x: e.clientX - position.left,
        y: e.clientY - position.top,
      };
      e.preventDefault();
    }
  };

  // resize start
  const onMouseDownResize = (e) => {
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

  // global mousemove / mouseup
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (draggingRef.current) {
        const newLeft = e.clientX - dragOffsetRef.current.x;
        const newTop = e.clientY - dragOffsetRef.current.y;
        setPosition((prev) => ({
          ...prev,
          left: newLeft < 0 ? 0 : newLeft,
          top: newTop < 0 ? 0 : newTop,
        }));
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
      draggingRef.current = false;
      resizingRef.current = false;

      // persistir posición
      try {
        localStorage.setItem(
          'execModalPos',
          JSON.stringify({
            top: position.top,
            left: position.left,
          })
        );
      } catch {
        /* ignore */
      }

      // persistir tamaño
      try {
        localStorage.setItem(
          'execModalSize',
          JSON.stringify({
            width: size.width,
            height: size.height,
          })
        );
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minSize, position, size]);

  // minHeight dinámico (pero minWidth fijo para que la barra search no fuerce crecimiento)
  useLayoutEffect(() => {
    if (!headerRef.current || !toolbarRef.current || !inputBarRef.current)
      return;

    const headerRect = headerRef.current.getBoundingClientRect();
    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const inputRect = inputBarRef.current.getBoundingClientRect();

    const calcMinHeight =
      headerRect.height + toolbarRect.height + inputRect.height + 120;

    setMinSize({
      minWidth: 400, // fijo
      minHeight: Math.max(200, Math.ceil(calcMinHeight)),
    });
  }, [currentCmd, searchTerm]);

  return (
    <div className="modal-overlay">
      <div
        className="modal-content floating-modal"
        style={{
          top: position.top,
          left: position.left,
          width: size.width,
          height: size.height,
          minWidth: minSize.minWidth,
          minHeight: minSize.minHeight,
          display: 'flex',
          flexDirection: 'column',
        }}
        onMouseDown={onMouseDownDrag}
      >
        {/* HEADER (draggable) */}
        <div
          ref={headerRef}
          className="modal-header draggable-area"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1rem',
            }}
          >
            <FaTerminal />
            <span style={{ fontSize: '1rem', lineHeight: 1.2 }}>
              Terminal for {containerId}
            </span>
          </div>
          <button onClick={onClose} className="close-button">
            X
          </button>
        </div>

        {/* TOOLBAR (búsqueda) */}
        <div
          ref={toolbarRef}
          className="modal-toolbar"
          style={{ flexShrink: 0, alignItems: 'center', gap: '1rem' }}
        >
          <div className="search-container">
            <FaSearch />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button onClick={() => goToMatch('prev')}>&lt;</button>
            <button onClick={() => goToMatch('next')}>&gt;</button>
            <span>
              {searchTerm &&
                (matches.length > 0
                  ? `${currentMatch + 1} of ${matches.length}`
                  : 'No matches')}
            </span>
          </div>
        </div>

        {/* OUTPUT (buffer terminal) */}
        <div
          style={{
            flexGrow: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'stretch',
            overflow: 'hidden',
          }}
        >
          <pre
            ref={outputRef}
            className="logs-container"
            style={{
              width: '95%',
              margin: 0,
              borderRadius: '6px',
              backgroundColor: '#111',
              color: '#0f0',
              fontSize: '0.8rem',
            }}
          >
            {terminalLines.map((lineObj, idx) => (
              <div
                key={idx}
                style={{
                  color: lineObj.color || '#0f0',
                  fontSize: lineObj.small ? '0.7rem' : '0.8rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {renderHighlightedLine(
                  idx,
                  lineObj.text || '',
                  { color: lineObj.color || '#0f0' }
                )}
              </div>
            ))}
          </pre>
        </div>

        {/* INPUT BAR */}
        <div
          ref={inputBarRef}
          className="exec-input-bar"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderTop: '1px solid #444',
            backgroundColor: '#1a1a1a',
            color: '#eee',
            flexShrink: 0,
          }}
        >
          <span
            className="exec-prompt"
            style={{
              color: '#0ff',
              fontFamily: 'monospace',
              lineHeight: '1.4rem',
            }}
          >
            $
          </span>
          <textarea
            ref={inputRef}
            className="exec-input"
            value={currentCmd}
            onChange={(e) => setCurrentCmd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command and press Enter… (use 'clear' to clear output)"
            style={{
              flexGrow: 1,
              minHeight: '2.2rem',
              maxHeight: '6rem',
              resize: 'none',
              backgroundColor: '#000',
              color: '#0f0',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              lineHeight: '1.2rem',
              border: '1px solid #444',
              borderRadius: '4px',
              padding: '0.5rem',
              boxSizing: 'border-box',
              width: '100%',
            }}
          />
          <button
            className="exec-run-button"
            onClick={executeCommand}
            title="Run command"
            style={{
              background: 'none',
              border: '1px solid #444',
              borderRadius: '4px',
              cursor: 'pointer',
              padding: '0.5rem 0.75rem',
              color: '#eee',
              fontSize: '0.8rem',
              lineHeight: 1.2,
              backgroundColor: '#222',
            }}
          >
            Run
          </button>
        </div>

        {/* handle resize abajo a la derecha */}
        <div
          className="resize-handle"
          onMouseDown={onMouseDownResize}
        />
      </div>
    </div>
  );
};

export default ExecModal;
