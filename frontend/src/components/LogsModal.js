// src/components/LogsModal.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const lineOptions = [100, 500, 1000, 5000];
  const logsContainerRef = useRef(null);

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      setIsFlashing(true);
      setTimeout(() => {
        setIsFlashing(false);
      }, 300); // Flash for 200ms
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

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

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

  useEffect(() => {
    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'gi');
      const newMatches = [];
      logs.split('\n').forEach((line, lineIndex) => {
        let match;
        while ((match = regex.exec(line)) !== null) {
          newMatches.push({ line: lineIndex, start: match.index, end: match.index + match[0].length });
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
      const currentMatchElement = logsContainerRef.current.querySelector('.current-match');
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
              <span key={j} className={isCurrent ? 'current-match' : 'highlight'}>
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

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Logs for {containerId}</h2>
          <button onClick={onClose} className="close-button">X</button>
        </div>
        <div className="modal-toolbar">
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
              {searchTerm && (matches.length > 0 ? `${currentMatch + 1} of ${matches.length}` : 'No matches')}
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
        <pre ref={logsContainerRef} className={`logs-container ${isFlashing ? 'flash' : ''}`}>
          {error ? <p className="error">{error}</p> : getHighlightedLogs()}
        </pre>
      </div>
    </div>
  );
};

export default LogsModal;
