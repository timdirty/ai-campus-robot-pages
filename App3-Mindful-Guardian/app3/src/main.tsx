import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';


// Prevent unhandled promise rejections from crashing the app silently.
// Network errors (bridge offline) are expected and suppressed.
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason);
  if (/fetch|networkerror|aborted|failed to fetch/i.test(msg)) { event.preventDefault(); return; }
  console.error('[app] unhandled rejection:', event.reason);
  event.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
