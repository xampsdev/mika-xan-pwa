import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initPwaIconInjection } from './lib/pwaIconGenerator';

initPwaIconInjection();

createRoot(document.getElementById('root')!).render(<App />);
