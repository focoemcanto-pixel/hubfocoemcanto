import './admin.css';
import './school-admin.css';
import './admin-redesign.css';
import './module-settings-overrides.css';
import './dashboard-premium.css';
import './admin-extras.css';
import './foco-live/foco-live.css';
import '../app-premium.css';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: 'D' },
  { href: '/admin/foco-live', label: 'Foco Live', icon: 'L' },
  { href: '/admin/produtos', label: 'Produtos', icon: 'P' },
  { href: '/admin/alunos', label: 'Alunos', icon: 'A' },
  { href: '/admin/premium', label: 'Assinaturas', icon: 'S' },
  { href: '/admin/avaliacoes', label: 'Avaliacoes', icon: 'V' },
  { href: '/admin/comunidade', label: 'Comunidade', icon: 'C' },
  { href: '/admin/configuracoes/branding', label: 'Branding', icon: 'B' },
  { href: '/admin/configuracoes', label: 'Configuracoes', icon: 'G' },
];

export default function AdminLayout(props: { children: any }) {
  return (
    <div className="admin-studio-shell">
      <aside className="admin-studio-sidebar">
        <a className="admin-studio-logo" href="/admin"><span className="admin-studio-mark">F</span><div><strong>FOCO</strong><small>EM CANTO</small></div></a>
        <nav className="admin-studio-nav">
          {navItems.map((item) => <a href={item.href} key={item.href}><span>{item.icon}</span>{item.label}</a>)}
        </nav>
        <div className="admin-studio-plan"><small>Plano atual</small><strong>PROFESSOR</strong><p>Admin da escola.</p></div>
      </aside>
      <section className="admin-studio-main">{props.children}</section>
    </div>
  );
}
