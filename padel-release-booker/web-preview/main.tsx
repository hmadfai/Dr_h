import './shim.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/renderer/src/App.js';
import '../src/renderer/src/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
