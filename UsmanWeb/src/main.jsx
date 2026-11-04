import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SystemUpdateProvider } from './context/SystemUpdateContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SystemUpdateProvider>
        <App />
      </SystemUpdateProvider>
    </AuthProvider>
  </React.StrictMode>
);
