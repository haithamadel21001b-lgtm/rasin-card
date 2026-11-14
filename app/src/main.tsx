import './styles.css';
import { createRoot } from 'react-dom/client';
import App from './App';
import { rosettePattern } from './ui/icons';
import { DEMO } from './lib/api';

document.documentElement.style.setProperty('--rosettes', rosettePattern());
createRoot(document.getElementById('root')!).render(<App />);

if (!DEMO && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
