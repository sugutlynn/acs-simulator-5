import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ACS — Attention Competition Simulator',
  description: 'Estimate attentional fragmentation in digital interfaces using the Biased Competition Model. CS 6795 Cognitive Science, Georgia Tech.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ACS' },
};

export const viewport: Viewport = {
  themeColor: '#0062cc',
  width: 'device-width',
  initialScale: 1,
};

// Prevent flash of wrong theme + register service worker
const bootScript = `
(function() {
  try {
    var h = document.documentElement;
    h.setAttribute('data-theme',         localStorage.getItem('acs-theme') || 'light');
    if (localStorage.getItem('acs-hc')  === 'true') h.setAttribute('data-high-contrast','true');
    if (localStorage.getItem('acs-rm')  === 'true') h.setAttribute('data-reduced-motion','true');
    if (localStorage.getItem('acs-lg')  === 'true') h.setAttribute('data-large-text','true');
  } catch(e) {}
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    });
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
