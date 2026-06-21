import './globals.css';
import './premium-ui.css';
import './course-ui.css';
import './lesson-premium.css';
import './activity-premium.css';
import './hub-premium-overrides.css';
import './admin-module-premium.css';
import './activity-mobile-fixes.css';

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{props.children}</body>
    </html>
  );
}
