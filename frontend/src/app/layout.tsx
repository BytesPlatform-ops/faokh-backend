import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';

import './globals.css';

/** The same pairing as the Foakh marketing site: the CRM is a different tool,
 *  but it must read as the same company. */
const display = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['400', '500', '600'],
});

const sans = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = {
  title: { default: 'Foakh Broker CRM', template: '%s · Foakh CRM' },
  description:
    'Broker booking CRM for Foakh Wind Corridor Enclave, 2FQ3+W4X, DHA City, Karachi.',
  // An internal tool must never be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#f5ede3',
  width: 'device-width',
  initialScale: 1,
  // Never disable zoom — pinch-to-zoom is an accessibility requirement.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
