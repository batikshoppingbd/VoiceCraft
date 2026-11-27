import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Sync canonical and OpenGraph URL tags dynamically to the live deployment origin
if (typeof window !== 'undefined') {
  const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
  const canonicalEl = document.getElementById('canonical-url');
  if (canonicalEl instanceof HTMLLinkElement) {
    canonicalEl.href = canonicalUrl;
  }
  const ogUrlEl = document.getElementById('og-url');
  if (ogUrlEl instanceof HTMLMetaElement) {
    ogUrlEl.content = canonicalUrl;
  }

  // Optional Google Analytics 4 support when VITE_GA_MEASUREMENT_ID is configured
  const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (gaId && /^G-[A-Z0-9]+$/i.test(gaId.trim())) {
    const cleanId = gaId.trim();
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${cleanId}`;
    document.head.appendChild(script);

    const win = window as unknown as {
      dataLayer?: unknown[];
      gtag?: (...args: unknown[]) => void;
    };
    win.dataLayer = win.dataLayer || [];
    win.gtag = (...args: unknown[]) => {
      win.dataLayer?.push(args);
    };
    win.gtag('js', new Date());
    win.gtag('config', cleanId);
  }
}

createRoot(document.getElementById('root')!).render(<App />);
