// src/components/LogsModal.js
import React, { useState, useEffect, useCallback } from 'react';
import { getContainerLogs } from '../api';
import { FaSync } from 'react-icons/fa';

const LogsModal = ({ containerId, onClose }) => {
  const [logs, setLogs] = useState('');
  const [lines, setLines] = useState(1000);
  const [error, setError] = useState('');
  const lineOptions = [100, 500, 1000, 5000];

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
          <button onClick={fetchLogs} className="update-logs-button">
            <FaSync /> 
          </button>
        </div>
        <pre className="logs-container">
          {error ? <p className="error">{error}</p> : logs}
        </pre>
      </div>
    </div>
  );
};

export default LogsModal;
