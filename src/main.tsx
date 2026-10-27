import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './styles.css';
import { StoreProvider } from './state/store';
import { App } from './App';
import { Boot } from './components/Boot';
import { applyTheme } from './lib/theme';
import { initLock } from './lib/lock';

applyTheme();
void initLock();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Boot>
        <StoreProvider>
          <App />
        </StoreProvider>
      </Boot>
    </HashRouter>
  </React.StrictMode>,
);
