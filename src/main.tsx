import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { migrateLegacyHash } from './router';
import './styles.css';

migrateLegacyHash();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
