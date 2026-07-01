'use client';

import { useState } from 'react';
import { Crown, Lock, Sparkles, X } from 'lucide-react';

const VIP_CHECKOUT_URL = process.env.NEXT_PUBLIC_VIP_CHECKOUT_URL || 'https://pay.kiwify.com.br/HHr4eyM';

const css = `.central-vip-trigger{cursor:pointer}.central-vip-modal-backdrop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(0,0,0,.68);backdrop-filter:blur(14px);padding:20px}.central-vip-modal{position:relative;width:min(430px,100%);border:1px solid rgba(245,199,107,.34);border-radius:28px;background:radial-gradient(circle at 86% 0,rgba(245,199,107,.20),transparent 34%),linear-gradient(145deg,#111216,#050609);box-shadow:0 36px 130px rgba(0,0,0,.58);padding:26px;color:#fff;text-align:center}.central-vip-close{position:absolute;right:14px;top:14px;width:38px;height:38px;border:0;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;display:grid;place-items:center}.central-vip-icon{width:68px;height:68px;margin:0 auto 16px;border-radius:24px;display:grid;place-items:center;color:#f5c76b;background:rgba(245,199,107,.14);border:1px solid rgba(245,199,107,.22)}.central-vip-modal .eyebrow{display:inline-flex;align-items:center;gap:7px;color:#f5c76b;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px;margin:0 0 10px}.central-vip-modal h3{font-size:29px;line-height:1.05;margin:0 0 10px;letter-spacing:-.04em}.central-vip-modal p{margin:0 auto 18px;color:rgba(255,255,255,.72);line-height:1.45}.central-vip-modal ul{text-align:left;margin:0 0 20px;padding:0;display:grid;gap:8px;list-style:none;color:rgba(255,255,255,.72)}.central-vip-modal li:before{content:'✓';color:#f5c76b;font-weight:950;margin-right:8px}.central-vip-cta{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;text-decoration:none;border-radius:18px;padding:15px 18px;background:linear-gradient(180deg,#ffe08a,#d59a2d);color:#130d04;font-weight:950}.central-vip-later{width:100%;margin-top:10px;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px 18px;background:rgba(255,255,255,.08);color:#fff;font-weight:900}`;

export function CentralVipLock({ children, title = 'Essa atividade faz parte da Sala de Atividades VIP' }: { children: React.ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="central-vip-trigger" role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setOpen(true); }}>{children}</div>
      {open ? <div className="central-vip-modal-backdrop" onClick={() => setOpen(false)}><section className="central-vip-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button className="central-vip-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar"><X size={18} /></button><div className="central-vip-icon"><Lock size={30} /></div><p className="eyebrow"><Sparkles size={14} /> Exclusivo Grupo VIP</p><h3>{title}</h3><p>Assine o Grupo VIP para liberar os exercícios, duetos, treinos personalizados e avaliações do professor.</p><ul><li>Exercícios guiados</li><li>Central personalizada</li><li>Envio para avaliação</li><li>Duetos na comunidade</li></ul><a className="central-vip-cta" href={VIP_CHECKOUT_URL}><Crown size={18} /> Assinar Grupo VIP</a><button className="central-vip-later" type="button" onClick={() => setOpen(false)}>Agora não</button></section></div> : null}
    </>
  );
}
