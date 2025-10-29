// src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  return (
    <Router>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" /> : <LoginPage setToken={setToken} />} />
        <Route path="/" element={token ? <Dashboard setToken={setToken} /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;