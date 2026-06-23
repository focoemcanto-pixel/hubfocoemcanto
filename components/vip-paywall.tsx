import { Headphones, Lock, Mic, Sparkles, Star, Users } from 'lucide-react';

const VIP_CHECKOUT_URL = 'https://pay.kiwify.com.br/HHr4eyM';

export function VipPaywall({ title = 'Conteúdo exclusivo do Grupo VIP' }: { title?: string }) {
  const benefits = [
    { icon: Headphones, text: 'Acessar exercícios e referências vocais' },
    { icon: Mic, text: 'Enviar sua voz para avaliação' },
    { icon: Users, text: 'Postar duetos na comunidade' },
    { icon: Star, text: 'Receber orientação, validação e evolução contínua' },
  ];

  return (
    <main className="vip-paywall-page">
      <section className="vip-paywall-backdrop">
        <div className="vip-paywall-modal">
          <div className="vip-paywall-orb"><Lock size={42} /></div>
          <p className="vip-paywall-eyebrow"><Sparkles size={16} /> Grupo VIP</p>
          <h1>{title}</h1>
          <p>Essa aula faz parte da Sala de Atividades VIP. Para assistir, realizar exercícios e participar das avaliações, é necessário ser assinante ativo.</p>
          <div className="vip-paywall-benefits">
            {benefits.map((benefit) => { const Icon = benefit.icon; return <div key={benefit.text}><Icon size={20} /><span>{benefit.text}</span></div>; })}
          </div>
          <a className="vip-paywall-button" href={VIP_CHECKOUT_URL}>Assinar Grupo VIP agora</a>
          <a className="vip-paywall-secondary" href="/aluno/comunidade">Voltar para comunidade</a>
        </div>
      </section>
    </main>
  );
}

export { VIP_CHECKOUT_URL };
