import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Demo } from './CardsDemo';
import './demo.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Demo />
  </StrictMode>
);
