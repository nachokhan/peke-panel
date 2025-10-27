// src/components/ExecModal.js
import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
} from 'react';
import { runContainerCommand } from '../api';
import { FaTerminal } from 'react-icons/fa';

const ExecModal = ({ containerId, onClose }) => {
  // terminal session history
  const [history, setHistory] = useState([]);

  // current input command
  const [currentCmd, setCurrentCmd] = useState('');

  // network / exec error
  const [error, setError] = useState('');

  // load persisted position/size for this modal type
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

  // we'll keep min size in state, but we won't let it grow with typing
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

  const headerRef = useRef(null);
  const inputBarRef = useRef(null);
  const outputRef = useRef(null);

  // auto-scroll output when history updates
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

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

  // run command
  const executeCommand = async () => {
    const cmd = currentCmd.trim();
    if (!cmd) return;

    try {
      setError('');
      const response = await runContainerCommand(containerId, cmd);
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

  // Enter submits
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  };

  // dragging logic
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

  // resizing logic
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

  // global mousemove/mouseup for drag+resize
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

      // persist position
      try {
        localStorage.setItem(
          'execModalPos',
          JSON.stringify({
            top: position.top,
            left: position.left,
          })
        );
      } catch {
        /* ignore storage errors */
      }

      // persist size
      try {
        localStorage.setItem(
          'execModalSize',
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
  }, [minSize, position, size]);

  // compute minHeight only (stable minWidth = 400)
  // ya no usamos el ancho dinámico de la barra de input para empujar minWidth
  useLayoutEffect(() => {
    if (!headerRef.current || !inputBarRef.current) return;

    const headerRect = headerRef.current.getBoundingClientRect();
    const inputRect = inputBarRef.current.getBoundingClientRect();

    // Queremos altura mínima suficiente:
    // header + input bar + ~120px para output visible
    const calcMinHeight = headerRect.height + inputRect.height + 120;

    setMinSize((prev) => ({
      minWidth: 400, // fijo, NO crece cuando tipeas
      minHeight: Math.max(200, Math.ceil(calcMinHeight)),
    }));
  }, [currentCmd]);

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
        {/* HEADER */}
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

        {/* OUTPUT AREA */}
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
            {error && (
              <div style={{ color: 'red', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            {history.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '1rem' }}>
                <div style={{ color: '#0ff' }}>
                  $ {item.command}
                </div>
                {item.stdout && (
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      color: '#0f0',
                    }}
                  >
                    {item.stdout}
                  </div>
                )}
                {item.stderr && (
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      color: '#f00',
                    }}
                  >
                    {item.stderr}
                  </div>
                )}
                <div
                  style={{
                    color: '#888',
                    fontSize: '0.7rem',
                  }}
                >
                  exit code: {item.returncode}
                </div>
              </div>
            ))}
          </pre>
        </div>

        {/* INPUT BAR */}
        <div ref={inputBarRef} className="exec-input-bar">
          <span className="exec-prompt">$</span>
          <textarea
            className="exec-input"
            value={currentCmd}
            onChange={(e) => setCurrentCmd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command and press Enter…"
          />
          <button
            className="exec-run-button"
            onClick={executeCommand}
            title="Run command"
          >
            Run
          </button>
        </div>

        {/* resize handle */}
        <div
          className="resize-handle"
          onMouseDown={onMouseDownResize}
        />
      </div>
    </div>
  );
};

export default ExecModal;
