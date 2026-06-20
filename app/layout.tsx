import './globals.css';
import './premium-ui.css';
import './course-ui.css';

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{props.children}</body>
    </html>
  );
}
