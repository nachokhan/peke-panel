// src/components/LogsModal.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getContainerLogs } from '../api';
import { FaSync, FaCopy } from 'react-icons/fa';

const LogsModal = ({ containerId, onClose }) => {
  const [logs, setLogs] = useState('');
  const [lines, setLines] = useState(1000);
  const [error, setError] = useState('');
  const lineOptions = [100, 500, 1000, 5000];
  const logsContainerRef = useRef(null);

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      // alert('Logs copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy logs: ', err);
      // alert('Failed to copy logs.');
    }
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
          <div className="modal-toolbar-actions">
            <button onClick={fetchLogs} className="update-logs-button">
              <FaSync /> 
            </button>
            <button onClick={handleCopyLogs} className="update-logs-button">
              <FaCopy />
            </button>
          </div>
        </div>
        <pre ref={logsContainerRef} className="logs-container">
          {error ? <p className="error">{error}</p> : logs}
        </pre>
      </div>
    </div>
  );
};

export default LogsModal;
