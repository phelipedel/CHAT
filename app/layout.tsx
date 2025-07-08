import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bate Papo Privado',
  description: 'Chat privado e seguro em tempo real',
  manifest: '/manifest.json',
  themeColor: '#6366f1',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icons/icon-192x192.png" />
        <meta name="theme-color" content="#6366f1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Bate Papo Privado" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);
                    }, function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }
            `
          }}
        />
      </head>
      <body className="bg-slate-950 text-white min-h-screen [-webkit-app-region:drag] overflow-hidden">
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
          {children}
        </div>
      </body>
    </html>
  );
}