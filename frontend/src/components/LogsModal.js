// src/components/LogsModal.js
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from 'react';
import { getContainerLogs } from '../api';
import { FaSync, FaCopy, FaDownload, FaSearch } from 'react-icons/fa';

const LogsModal = ({ containerId, onClose }) => {
  const [logs, setLogs] = useState('');
  const [lines, setLines] = useState(100);
  const [error, setError] = useState('');
  const [isFlashing, setIsFlashing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [matches, setMatches] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(0);

 // load persisted position (shared for all containers)
 const getInitialPosition = () => {
   try {
     const raw = localStorage.getItem('logsModalPos');
     if (!raw) {
       return { top: 80, left: 80 };
     }
     const parsed = JSON.parse(raw);
     if (
       typeof parsed.top === 'number' &&
       typeof parsed.left === 'number'
     ) {
       return { top: parsed.top, left: parsed.left };
     }
     return { top: 80, left: 80 };
   } catch {
     return { top: 80, left: 80 };
   }
 };

 // load persisted size (shared for all containers)
 const getInitialSize = () => {
   try {
     const raw = localStorage.getItem('logsModalSize');
     if (!raw) {
       return { width: 700, height: 400 };
     }
     const parsed = JSON.parse(raw);
     if (
       typeof parsed.width === 'number' &&
       typeof parsed.height === 'number'
     ) {
       return { width: parsed.width, height: parsed.height };
     }
     return { width: 700, height: 400 };
   } catch {
     return { width: 700, height: 400 };
   }
 };

 // floating modal position/size state (now initialized from localStorage)
 const [position, setPosition] = useState(getInitialPosition);
 const [size, setSize] = useState(getInitialSize); 

  // min size (calculated from toolbar contents so it never shrinks too much)
  const [minSize, setMinSize] = useState({ minWidth: 400, minHeight: 200 });

  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const resizingRef = useRef(false);
  const resizeStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    startW: 0,
    startH: 0,
  });

  const modalRef = useRef(null);
  const headerRef = useRef(null);
  const toolbarRef = useRef(null);
  const logsContainerRef = useRef(null);

  const lineOptions = [100, 500, 1000, 5000];

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      setIsFlashing(true);
      setTimeout(() => {
        setIsFlashing(false);
      }, 300);
    } catch (err) {
      console.error('Failed to copy logs: ', err);
    }
  };

  const handleExportLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${containerId}-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchLogs = useCallback(async () => {
    try {
      setError('');
      const response = await getContainerLogs(containerId, lines);
      setLogs(response.data.logs);
    } catch (error) {
      setError('Failed to fetch logs');
    }
  }, [containerId, lines]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // auto-scroll to bottom on new logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop =
        logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // close on ESC
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

  // search / highlight logic
  useEffect(() => {
    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'gi');
      const newMatches = [];
      logs.split('\n').forEach((line, lineIndex) => {
        let match;
        while ((match = regex.exec(line)) !== null) {
          newMatches.push({
            line: lineIndex,
            start: match.index,
            end: match.index + match[0].length,
          });
        }
      });
      setMatches(newMatches);
      setCurrentMatch(0);
    } else {
      setMatches([]);
    }
  }, [searchTerm, logs]);

  useEffect(() => {
    if (matches.length > 0 && logsContainerRef.current) {
      const currentMatchElement =
        logsContainerRef.current.querySelector('.current-match');
      if (currentMatchElement) {
        currentMatchElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentMatch, matches]);

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

  const getHighlightedLogs = () => {
    if (!searchTerm) {
      return logs;
    }

    let matchIndex = 0;
    const regex = new RegExp(`(${searchTerm})`, 'gi');

    return logs.split('\n').map((line, i) => (
      <span key={i}>
        {line.split(regex).map((part, j) => {
          if (regex.test(part)) {
            const isCurrent = matchIndex === currentMatch;
            matchIndex++;
            return (
              <span
                key={j}
                className={isCurrent ? 'current-match' : 'highlight'}
              >
                {part}
              </span>
            );
          } else {
            return part;
          }
        })}
        <br />
      </span>
    ));
  };

  // ----- dragging -----
  const onMouseDownDrag = (e) => {
    // only start drag if header is clicked
    if (e.target.closest('.modal-header')) {
      draggingRef.current = true;
      dragOffsetRef.current = {
        x: e.clientX - position.left,
        y: e.clientY - position.top,
      };
      e.preventDefault();
    }
  };

  // ----- resizing -----
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

  // global mouse move
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (draggingRef.current) {
        const newLeft = e.clientX - dragOffsetRef.current.x;
        const newTop = e.clientY - dragOffsetRef.current.y;
        setPosition((prev) => {
         const nextPos = {
           ...prev,
           left: newLeft < 0 ? 0 : newLeft,
           top: newTop < 0 ? 0 : newTop,
         };
         return nextPos;
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
      const wasDragging = draggingRef.current;
      const wasResizing = resizingRef.current;

      draggingRef.current = false;
      resizingRef.current = false;

      // persist both position and size when mouse is released,
      // regardless of whether it was drag or resize.
      // this way, when you close and reopen, you get last state.
      try {
        // save position
        localStorage.setItem(
          'logsModalPos',
          JSON.stringify({
            top: position.top,
            left: position.left,
          })
        );
      } catch {
        /* ignore storage errors */
      }

      try {
        localStorage.setItem(
          'logsModalSize',
          JSON.stringify({
            width: size.width,
            height: size.height,
          })
        );
      } catch {
        /* ignore storage errors */
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
   };
 }, [minSize, size, position]);

  // calculate minWidth/minHeight based on header+toolbar so toolbar never wraps/cuts
  useLayoutEffect(() => {
  if (!headerRef.current || !toolbarRef.current) return;

  const headerRect = headerRef.current.getBoundingClientRect();
  const toolbarRect = toolbarRef.current.getBoundingClientRect();

  // altura mínima: header + toolbar + ~150px de área de logs
  const calcMinHeight = headerRect.height + toolbarRect.height + 150;

  // ancho mínimo CONSTANTE
  // ya no dependemos del ancho de la toolbar (que cambia cuando tipeás),
  // así evitamos que el modal se siga estirando.
  setMinSize({
    minWidth: 400,
    minHeight: Math.max(200, Math.ceil(calcMinHeight)),
  });
}, [logs, searchTerm, lines]);


  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className="modal-content floating-modal"
        style={{
          top: position.top,
          left: position.left,
          width: size.width,
          height: size.height,
          minWidth: minSize.minWidth,
          minHeight: minSize.minHeight,
        }}
        onMouseDown={onMouseDownDrag}
      >
        <div ref={headerRef} className="modal-header draggable-area">
          <h2 style={{ margin: 0, fontSize: '1rem', lineHeight: 1.2 }}>
            Logs for {containerId}
          </h2>
          <button onClick={onClose} className="close-button">
            X
          </button>
        </div>

        <div
          ref={toolbarRef}
          className="modal-toolbar"
          style={{ flexShrink: 0 }}
        >
          <div className="lines-selector">
            <span>Lines:</span>
            <div className="lines-options">
              {lineOptions.map((option) => (
                <button
                  key={option}
                  className={`line-option ${lines === option ? 'active' : ''}`}
                  onClick={() => setLines(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

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

          <div className="modal-toolbar-actions">
            <button onClick={fetchLogs} className="update-logs-button">
              <FaSync />
            </button>
            <button onClick={handleCopyLogs} className="update-logs-button">
              <FaCopy />
            </button>
            <button onClick={handleExportLogs} className="update-logs-button">
              <FaDownload />
            </button>
          </div>
        </div>

        {/* logs wrapper: 95% width of modal, centered */}
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
            ref={logsContainerRef}
            className={`logs-container ${isFlashing ? 'flash' : ''}`}
            style={{
              width: '95%',
              margin: 0,
              borderRadius: '6px',
            }}
          >
            {error ? (
              <p className="error">{error}</p>
            ) : (
              getHighlightedLogs()
            )}
          </pre>
        </div>

        {/* bottom-right resize handle */}
        <div
          className="resize-handle"
          onMouseDown={onMouseDownResize}
        />
      </div>
    </div>
  );
};

export default LogsModal;
