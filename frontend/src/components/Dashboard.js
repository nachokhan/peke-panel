// src/components/Dashboard.js
import React, { useState, useEffect } from 'react';
import {
  getStatus,
  startContainer,
  stopContainer,
  restartContainer,
} from '../api';
import LogsModal from './LogsModal';
import ExecModal from './ExecModal';
import {
  FaPlay,
  FaStop,
  FaSync,
  FaFileAlt,
  FaCog,
  FaSun,
  FaMoon,
  FaTerminal,
} from 'react-icons/fa';

const Dashboard = ({ setToken }) => {
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [terminalContainer, setTerminalContainer] = useState(null);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [loading, setLoading] = useState(true);

  const fetchStatus = React.useCallback(async () => {
    try {
      const response = await getStatus();
      const updatedServices = response.data.map((service) => ({
        ...service,
        ram_usage: service.ram_usage || 'N/A',
        cpu_usage: service.cpu_usage || 'N/A',
        net_usage: service.net_usage || 'N/A',
      }));
      setServices(updatedServices);
    } catch (error) {
      setError('Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If either logs modal OR terminal modal is open, pause polling.
    if (selectedContainer || terminalContainer) {
      return;
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [fetchStatus, selectedContainer, terminalContainer]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  const handleAction = async (action, containerId) => {
    try {
      switch (action) {
        case 'start':
          await startContainer(containerId);
          break;
        case 'stop':
          await stopContainer(containerId);
          break;
        case 'restart':
          await restartContainer(containerId);
          break;
        default:
          break;
      }
      fetchStatus(); // Refresh status after action
    } catch (error) {
      setError(`Failed to ${action} container`);
    }
  };

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
    setShowSettingsDropdown(false);
  };

  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="dashboard-container">
      <nav>
        <h1>2Brains Health Monitor</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <button
              className="settings-button"
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
            >
              <FaCog />
            </button>
            {showSettingsDropdown && (
              <div
                className="settings-dropdown"
                style={{ right: 0, left: 'auto' }}
              >
                <button onClick={toggleTheme} className="theme-toggle-button">
                  {theme === 'dark' ? <FaSun /> : <FaMoon />}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
              </div>
            )}
          </div>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <div className="loading-container">
          <FaSync className="spin" />
          <p>Getting data...</p>
        </div>
      ) : (
        <div className="service-list">
          {services.map((service) => (
            <div
              key={service.id}
              className={`service-card status-${service.status}`}
            >
              <h3 className="service-card-title">{service.name}</h3>
              <p>
                <strong>Status:</strong>{' '}
                {service.status === 'running'
                  ? '✅ Running'
                  : service.status === 'stopped'
                  ? '❌ Stopped'
                  : '⚠️ Unhealthy'}
              </p>
              <p>
                ⏱️ <strong>Uptime:</strong> {service.uptime}
              </p>
              <p>
                🔌 <strong>Port:</strong> {service.port}
              </p>
              <p>
                💾 <strong>RAM:</strong> {service.ram_usage}
              </p>
              <p>
                🧠 <strong>CPU:</strong> {service.cpu_usage}
              </p>
              <p>
                🌐 <strong>NET:</strong> {service.net_usage}
              </p>

              <div className="service-actions">
                <button
                  onClick={() => handleAction('start', service.id)}
                  title="Start container"
                >
                  <FaPlay />
                </button>
                <button
                  onClick={() => handleAction('stop', service.id)}
                  title="Stop container"
                >
                  <FaStop />
                </button>
                <button
                  onClick={() => handleAction('restart', service.id)}
                  title="Restart container"
                >
                  <FaSync />
                </button>
                <button
                  onClick={() => setSelectedContainer(service.id)}
                  title="View logs"
                >
                  <FaFileAlt />
                </button>
                <button
                  onClick={() => setTerminalContainer(service.id)}
                  title="Open terminal"
                >
                  <FaTerminal />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedContainer && (
        <LogsModal
          containerId={selectedContainer}
          onClose={() => setSelectedContainer(null)}
        />
      )}

      {terminalContainer && (
        <ExecModal
          containerId={terminalContainer}
          onClose={() => setTerminalContainer(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
