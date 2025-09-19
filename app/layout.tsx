import "./globals.css";

export const metadata = {
  title: "Med Compare",
  description: "Best MXN price by SKU across supplier spreadsheets",
};

// Runs before React hydrates, so there’s no flash of the wrong theme
function ThemeScript() {
  const code = `
  (function () {
    try {
      var ls = localStorage.getItem('theme');
      var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = ls ? ls : (systemDark ? 'dark' : 'light');
      var root = document.documentElement;
      if (theme === 'dark') {
        root.dataset.theme = 'dark';
        root.classList.add('dark');
      } else {
        root.dataset.theme = 'light';
        root.classList.remove('dark');
      }
    } catch (e) {}
  })();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* lets the browser draw native form controls appropriately */}
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
