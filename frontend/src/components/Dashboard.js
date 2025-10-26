// src/components/Dashboard.js
import React, { useState, useEffect } from 'react';
import { getStatus, startContainer, stopContainer, restartContainer } from '../api';
import LogsModal from './LogsModal';
import { FaPlay, FaStop, FaSync, FaFileAlt } from 'react-icons/fa';

const Dashboard = ({ setToken }) => {
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [selectedContainer, setSelectedContainer] = useState(null);

  const fetchStatus = async () => {
    try {
      const response = await getStatus();
      setServices(response.data);
    } catch (error) {
      setError('Failed to fetch status');
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="dashboard-container">
      <nav>
        <h1>2Brains Health Monitor</h1>
        <button onClick={handleLogout}>Logout</button>
      </nav>
      {error && <p className="error">{error}</p>}
      <div className="service-list">
        {services.map((service) => (
          <div key={service.id} className={`service-card status-${service.status}`}>
            <h3>{service.name}</h3>
            <p>Status: {service.status}</p>
            <p>Uptime: {service.uptime}</p>
            <p>Port: {service.port}</p>
            <div className="service-actions">
              <button onClick={() => handleAction('start', service.id)}><FaPlay /></button>
              <button onClick={() => handleAction('stop', service.id)}><FaStop /></button>
              <button onClick={() => handleAction('restart', service.id)}><FaSync /></button>
              <button onClick={() => setSelectedContainer(service.id)}><FaFileAlt /></button>
            </div>
          </div>
        ))}
      </div>
      {selectedContainer && (
        <LogsModal
          containerId={selectedContainer}
          onClose={() => setSelectedContainer(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
