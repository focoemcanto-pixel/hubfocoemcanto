import './admin.css';
import './school-admin.css';
import './admin-redesign.css';
import '../app-premium.css';

const navItems = [
  { href: '/admin', label: 'Resumo', icon: '▦' },
  { href: '/admin/cursos', label: 'Cursos', icon: '◈' },
  { href: '/admin/biblioteca', label: 'Biblioteca', icon: '□' },
  { href: '/admin/alunos', label: 'Alunos', icon: '◇' },
  { href: '/admin/premium', label: 'Assinaturas', icon: '◌' },
  { href: '/admin/avaliacoes', label: 'Avaliações', icon: '☆' },
  { href: '/admin/comunidade', label: 'Comunidade', icon: '◎' },
  { href: '/admin/configuracoes', label: 'Configurações', icon: '⚙' },
];

export default function AdminLayout(props: { children: any }) {
  return (
    <div className="admin-studio-shell">
      <aside className="admin-studio-sidebar">
        <a className="admin-studio-logo" href="/admin">
          <span className="admin-studio-mark">▥</span>
          <div><strong>FOCO</strong><small>EM CANTO</small></div>
        </a>

        <nav className="admin-studio-nav">
          {navItems.map((item) => <a href={item.href} key={item.href}><span>{item.icon}</span>{item.label}</a>)}
        </nav>

        <div className="admin-studio-plan">
          <small>Plano atual</small>
          <strong>PROFESSOR</strong>
          <p>Administração completa da escola.</p>
        </div>
      </aside>

      <section className="admin-studio-main">
        {props.children}
      </section>
    </div>
  );
}
