export const intonationPremiumStyles = `
/*
  Template visual premium para Atividade 3 — Afinação.
  Objetivo: manter layout compacto, sem scroll desnecessário, com feedback em tempo real.
  Escopo isolado: tudo fica dentro de .intonation-premium para não quebrar percepção/aquecimento.
*/
.intonation-premium{
  --ip-bg:#070809;
  --ip-bg-soft:#121416;
  --ip-panel:rgba(255,255,255,.045);
  --ip-panel-strong:rgba(255,255,255,.075);
  --ip-line:rgba(255,212,130,.34);
  --ip-line-soft:rgba(255,212,130,.16);
  --ip-gold:#f3bd59;
  --ip-gold-2:#ffd98a;
  --ip-gold-3:#fff0c4;
  --ip-text:#fff8ec;
  --ip-muted:rgba(255,248,236,.68);
  --ip-dim:rgba(255,255,255,.35);
  --ip-red:#ff4d58;
  --ip-green:#6be58a;
  --ip-blue:#79c8ff;
  min-height:100svh;
  width:100%;
  overflow:hidden;
  position:relative;
  isolation:isolate;
  color:var(--ip-text);
  font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;
  text-align:center;
  padding:calc(14px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 50% -8%,rgba(255,218,138,.12),transparent 27%),
    radial-gradient(circle at 50% 47%,rgba(243,189,89,.08),transparent 32%),
    linear-gradient(180deg,#16191a 0%,#090a0b 62%,#050607 100%);
  -webkit-user-select:none;
  user-select:none;
  -webkit-touch-callout:none;
  touch-action:manipulation;
}
.intonation-premium::before{
  content:'';
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:-2;
  background:repeating-linear-gradient(112deg,rgba(255,255,255,.022) 0 1px,transparent 1px 27px);
  opacity:.72;
}
.intonation-premium::after{
  content:'';
  position:absolute;
  left:50%;
  top:-1px;
  width:100%;
  height:84px;
  transform:translateX(-50%);
  pointer-events:none;
  z-index:8;
  background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,.06) 38%,transparent);
  mix-blend-mode:screen;
}
.intonation-premium *,
.intonation-premium *::before,
.intonation-premium *::after{
  box-sizing:border-box;
  -webkit-user-select:none;
  user-select:none;
  -webkit-touch-callout:none;
}
.intonation-premium button{
  font:inherit;
  color:inherit;
  border:0;
  background:none;
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}

/* HEADER — mesmo DNA premium da percepção, mas isolado para afinação */
.ip-header{
  width:min(100%,430px);
  height:58px;
  margin:0 auto 8px;
  display:grid;
  grid-template-columns:88px 1fr 44px;
  align-items:center;
  gap:12px;
  position:relative;
  z-index:2;
}
.ip-exit{
  height:38px;
  border:1.5px solid var(--ip-gold);
  border-radius:999px;
  color:var(--ip-gold-2);
  background:linear-gradient(180deg,rgba(255,216,138,.07),rgba(255,216,138,.02));
  box-shadow:0 0 18px rgba(243,189,89,.08) inset,0 0 14px rgba(243,189,89,.06);
  font:800 16px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}
.ip-level{
  color:var(--ip-gold-2);
  letter-spacing:.18em;
  font-size:22px;
  text-shadow:0 0 16px rgba(243,189,89,.22);
}
.ip-info{
  width:42px;
  height:42px;
  display:grid;
  place-items:center;
  border:1.5px solid var(--ip-gold);
  border-radius:50%;
  color:var(--ip-gold-2);
  background:rgba(255,216,138,.035);
  font:900 24px Georgia,serif;
  font-style:italic;
}

/* BARRA DE ETAPAS */
.ip-steps{
  width:min(100%,430px);
  margin:0 auto 12px;
  height:72px;
  display:grid;
  grid-template-columns:repeat(6,1fr);
  align-items:center;
  gap:8px;
  position:relative;
  z-index:2;
}
.ip-step{
  position:relative;
  height:58px;
  display:grid;
  place-items:center;
  color:rgba(255,255,255,.42);
}
.ip-step svg{
  width:31px;
  height:31px;
  fill:none;
  stroke:currentColor;
  stroke-width:4;
  stroke-linecap:round;
  stroke-linejoin:round;
}
.ip-step.is-active{
  color:var(--ip-gold-2);
  filter:drop-shadow(0 0 14px rgba(255,217,138,.5));
}
.ip-step.is-active::after{
  content:'';
  position:absolute;
  bottom:-8px;
  width:48px;
  height:2px;
  border-radius:999px;
  background:linear-gradient(90deg,transparent,var(--ip-gold-2),transparent);
}
.ip-step-mark{
  position:absolute;
  bottom:-30px;
  font:900 23px/1 system-ui;
  color:#24e978;
}
.ip-step.is-wrong .ip-step-mark{color:#ff4646;}

/* ÁREA GERAL DO EXERCÍCIO */
.ip-stage{
  width:min(100%,430px);
  height:min(740px,calc(100svh - 154px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
  min-height:610px;
  max-height:760px;
  margin:0 auto;
  position:relative;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:12px;
  padding-top:18px;
}
.ip-medal{
  width:72px;
  height:72px;
  border:2px solid var(--ip-gold-2);
  border-radius:50%;
  display:grid;
  place-items:center;
  position:relative;
  background:radial-gradient(circle,rgba(255,216,138,.06),rgba(0,0,0,.4) 68%);
  box-shadow:0 0 22px rgba(255,216,138,.2),0 0 0 1px rgba(0,0,0,.38) inset;
  flex:0 0 auto;
}
.ip-medal::before{
  content:'♛';
  position:absolute;
  top:-25px;
  left:50%;
  transform:translateX(-50%);
  color:var(--ip-gold-2);
  font:900 28px/1 Georgia,serif;
  text-shadow:0 0 14px rgba(255,216,138,.36);
}
.ip-medal::after{
  content:'';
  position:absolute;
  left:50%;
  top:50%;
  width:240px;
  height:1px;
  transform:translate(-50%,-50%);
  background:linear-gradient(90deg,transparent,rgba(255,216,138,.45),transparent);
  z-index:-1;
}
.ip-medal span{
  color:var(--ip-gold-2);
  font-size:26px;
  transform:translateY(-1px);
}
.ip-title{
  margin:12px 0 0;
  max-width:390px;
}
.ip-kicker{
  display:inline-flex;
  align-items:center;
  gap:10px;
  margin-bottom:8px;
  padding:6px 16px;
  border:1px solid var(--ip-line-soft);
  border-radius:999px;
  color:var(--ip-gold-2);
  letter-spacing:.22em;
  font-size:12px;
  font-weight:900;
  text-transform:uppercase;
  background:rgba(255,216,138,.025);
}
.ip-title h1{
  margin:0;
  color:var(--ip-text);
  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:clamp(34px,9vw,48px);
  line-height:.98;
  letter-spacing:.02em;
  font-weight:950;
  text-transform:uppercase;
  text-shadow:0 10px 28px rgba(0,0,0,.4);
}
.ip-title p{
  margin:10px auto 0;
  max-width:350px;
  color:var(--ip-muted);
  font:400 16px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}
.ip-divider{
  width:170px;
  height:14px;
  margin:0 auto;
  position:relative;
  flex:0 0 auto;
}
.ip-divider::before{
  content:'';
  position:absolute;
  left:0;
  right:0;
  top:50%;
  height:1px;
  background:linear-gradient(90deg,transparent,var(--ip-line),transparent);
}
.ip-divider::after{
  content:'◆';
  position:absolute;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
  color:var(--ip-gold-2);
  font-size:12px;
  text-shadow:0 0 14px rgba(255,216,138,.6);
}

/* CARD PRINCIPAL DO AFINADOR */
.ip-target-card{
  width:100%;
  min-height:318px;
  border:1.35px solid var(--ip-line);
  border-radius:34px;
  background:
    radial-gradient(circle at 50% 46%,rgba(255,216,138,.11),transparent 31%),
    linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018));
  box-shadow:0 22px 70px rgba(0,0,0,.38),0 0 28px rgba(243,189,89,.07) inset;
  position:relative;
  display:grid;
  grid-template-rows:auto 1fr auto;
  align-items:center;
  padding:22px 18px 18px;
  overflow:hidden;
  flex:0 0 auto;
}
.ip-target-card::before{
  content:'';
  position:absolute;
  inset:0;
  border-radius:inherit;
  background:linear-gradient(115deg,transparent,rgba(255,255,255,.04),transparent 58%);
  pointer-events:none;
}
.ip-target-label{
  color:var(--ip-gold-2);
  letter-spacing:.22em;
  text-transform:uppercase;
  font-weight:900;
  font-size:13px;
}
.ip-note-target{
  margin-top:8px;
  color:var(--ip-gold-2);
  font:900 42px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  text-shadow:0 0 20px rgba(255,216,138,.32);
}
.ip-radar{
  --ip-ball-y:34px;
  width:232px;
  height:190px;
  margin:0 auto;
  position:relative;
  display:grid;
  place-items:center;
}
.ip-radar::before,
.ip-radar::after{
  content:'';
  position:absolute;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
  border-radius:50%;
  pointer-events:none;
}
.ip-radar::before{
  width:150px;
  height:150px;
  border:2px solid rgba(255,216,138,.26);
  box-shadow:0 0 36px rgba(255,216,138,.1) inset;
}
.ip-radar::after{
  width:74px;
  height:74px;
  border:4px solid var(--ip-gold-2);
  box-shadow:0 0 28px rgba(255,216,138,.3),0 0 36px rgba(255,216,138,.16) inset;
}
.ip-crosshair{
  position:absolute;
  inset:0;
  background:
    linear-gradient(90deg,transparent 0 4%,rgba(255,216,138,.24) 4% 96%,transparent 96%) center/100% 1px no-repeat,
    linear-gradient(180deg,transparent 0 4%,rgba(255,216,138,.18) 4% 96%,transparent 96%) center/1px 100% no-repeat;
  opacity:.72;
}
.ip-ball{
  width:46px;
  height:46px;
  border-radius:50%;
  position:absolute;
  left:50%;
  top:50%;
  transform:translate(-50%,calc(-50% + var(--ip-ball-y)));
  background:radial-gradient(circle at 34% 25%,#ff8b8b 0,#ff3e4d 38%,#c91c2b 100%);
  box-shadow:0 12px 26px rgba(0,0,0,.42),0 0 22px rgba(255,77,88,.36);
  transition:transform 90ms linear,background 160ms ease,box-shadow 160ms ease;
  z-index:2;
}
.ip-ball.is-close{
  background:radial-gradient(circle at 34% 25%,#ffdca1 0,#f3bd59 44%,#b66d1e 100%);
  box-shadow:0 12px 26px rgba(0,0,0,.42),0 0 28px rgba(255,216,138,.46);
}
.ip-ball.is-perfect{
  background:radial-gradient(circle at 34% 25%,#c7ffd3 0,#53e87f 45%,#15944a 100%);
  box-shadow:0 12px 26px rgba(0,0,0,.42),0 0 34px rgba(107,229,138,.62);
}
.ip-radar.is-perfect::after{
  animation:ipPerfectPulse .72s ease-out infinite;
}
@keyframes ipPerfectPulse{
  0%{box-shadow:0 0 18px rgba(255,216,138,.3),0 0 0 0 rgba(255,216,138,.34)}
  70%{box-shadow:0 0 34px rgba(255,216,138,.56),0 0 0 24px rgba(255,216,138,0)}
  100%{box-shadow:0 0 18px rgba(255,216,138,.3),0 0 0 0 rgba(255,216,138,0)}
}
.ip-prompt{
  min-width:154px;
  margin:0 auto;
  padding:10px 18px;
  border:1px solid rgba(255,216,138,.14);
  border-radius:999px;
  color:rgba(255,248,236,.74);
  background:rgba(0,0,0,.26);
  font:500 15px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}

/* FEEDBACK EM TEMPO REAL */
.ip-feedback-card{
  width:100%;
  min-height:92px;
  border-radius:24px;
  border:1px solid rgba(255,255,255,.06);
  background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.025));
  box-shadow:0 18px 50px rgba(0,0,0,.24);
  padding:16px 18px 14px;
  flex:0 0 auto;
}
.ip-feedback-title{
  color:var(--ip-gold-2);
  font-size:12px;
  letter-spacing:.2em;
  text-transform:uppercase;
  font-weight:900;
  margin-bottom:14px;
}
.ip-cents-scale{
  display:grid;
  grid-template-columns:repeat(17,1fr);
  gap:9px;
  align-items:center;
  position:relative;
  padding:0 3px;
}
.ip-cents-scale i{
  display:block;
  width:10px;
  height:10px;
  border-radius:50%;
  margin:0 auto;
  background:rgba(255,255,255,.24);
}
.ip-cents-scale i:nth-child(-n+5){background:rgba(255,77,88,.82)}
.ip-cents-scale i:nth-child(n+13){background:rgba(107,229,138,.78)}
.ip-cents-scale i.is-center{
  width:28px;
  height:28px;
  border:3px solid var(--ip-gold-2);
  background:transparent;
  box-shadow:0 0 20px rgba(255,216,138,.34);
}
.ip-cents-marker{
  width:20px;
  height:20px;
  position:absolute;
  top:4px;
  left:50%;
  transform:translateX(-50%);
  border-radius:50%;
  border:2px solid var(--ip-text);
  background:rgba(255,216,138,.18);
  box-shadow:0 0 16px rgba(255,216,138,.32);
  transition:left 90ms linear;
}
.ip-feedback-labels{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-top:12px;
  font:500 13px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}
.ip-feedback-labels .grave{color:#ff6670}.ip-feedback-labels .ok{color:var(--ip-gold-2)}.ip-feedback-labels .agudo{color:#75e28b}

/* BLOCO DE NÍVEL */
.ip-level-card{
  width:100%;
  min-height:72px;
  border-radius:22px;
  border:1px solid rgba(255,255,255,.06);
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));
  display:grid;
  grid-template-columns:54px 1fr auto;
  align-items:center;
  gap:14px;
  padding:13px 16px;
  text-align:left;
  flex:0 0 auto;
}
.ip-level-card .ip-badge{
  width:44px;
  height:44px;
  border:2px solid var(--ip-gold-2);
  border-radius:50%;
  display:grid;
  place-items:center;
  color:var(--ip-gold-2);
  box-shadow:0 0 18px rgba(255,216,138,.16);
}
.ip-level-card h2{
  margin:0 0 4px;
  color:var(--ip-gold-2);
  font-size:14px;
  letter-spacing:.13em;
  text-transform:uppercase;
}
.ip-level-card p{
  margin:0;
  color:var(--ip-muted);
  font:400 13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}
.ip-counter{
  min-width:58px;
  height:42px;
  border-radius:17px;
  display:grid;
  place-items:center;
  background:rgba(255,255,255,.055);
  border:1px solid rgba(255,255,255,.08);
  color:var(--ip-text);
  font:800 16px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}

/* BOTÕES */
.ip-primary{
  width:100%;
  min-height:64px;
  border-radius:999px;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:12px;
  color:#101010;
  background:linear-gradient(180deg,#ffe49e,#e9ad47);
  box-shadow:0 18px 46px rgba(243,189,89,.22),0 2px 0 rgba(255,255,255,.48) inset;
  font:950 17px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  letter-spacing:.06em;
  text-transform:uppercase;
  flex:0 0 auto;
}
.ip-primary:active{transform:translateY(1px);filter:brightness(.96)}
.ip-secondary-sound{
  position:absolute;
  top:8px;
  right:4px;
  display:grid;
  place-items:center;
  width:54px;
  height:54px;
  border:1.5px solid var(--ip-line);
  border-radius:50%;
  color:var(--ip-gold-2);
  background:rgba(255,216,138,.035);
  box-shadow:0 0 20px rgba(255,216,138,.08);
}
.ip-secondary-sound svg{
  width:26px;
  height:26px;
  fill:currentColor;
}
.ip-secondary-sound-label{
  position:absolute;
  top:65px;
  right:-2px;
  width:70px;
  color:var(--ip-gold-2);
  font:500 12px/1.15 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}

/* ESTADOS DA AFINAÇÃO */
.intonation-premium[data-state='listening'] .ip-prompt{color:var(--ip-gold-2)}
.intonation-premium[data-state='too-low'] .ip-prompt::before{content:'↓ Grave';color:#ff6670}
.intonation-premium[data-state='too-high'] .ip-prompt::before{content:'↑ Agudo';color:#75e28b}
.intonation-premium[data-state='perfect'] .ip-prompt::before{content:'Afinado';color:#6be58a}
.intonation-premium[data-state='too-low'] .ip-prompt,
.intonation-premium[data-state='too-high'] .ip-prompt,
.intonation-premium[data-state='perfect'] .ip-prompt{font-size:0}
.intonation-premium[data-state='too-low'] .ip-prompt::before,
.intonation-premium[data-state='too-high'] .ip-prompt::before,
.intonation-premium[data-state='perfect'] .ip-prompt::before{font-size:15px}

/* RESPONSIVO — trava proporções para não truncar no iPhone em navegador */
@media (max-height:760px){
  .intonation-premium{padding-left:16px;padding-right:16px}
  .ip-header{height:48px;margin-bottom:3px}.ip-level{font-size:19px}.ip-exit{height:34px}.ip-info{width:38px;height:38px}
  .ip-steps{height:58px;margin-bottom:5px}.ip-step svg{width:27px;height:27px}.ip-step-mark{bottom:-23px;font-size:19px}.ip-step.is-active::after{bottom:-5px}
  .ip-stage{height:calc(100svh - 128px - env(safe-area-inset-top) - env(safe-area-inset-bottom));min-height:540px;gap:9px;padding-top:12px}
  .ip-medal{width:58px;height:58px}.ip-medal::before{font-size:23px;top:-20px}.ip-medal span{font-size:22px}
  .ip-title{margin-top:8px}.ip-kicker{font-size:11px;padding:5px 13px}.ip-title h1{font-size:34px}.ip-title p{font-size:14px;line-height:1.35;max-width:320px}
  .ip-divider{height:10px}
  .ip-target-card{min-height:258px;border-radius:28px;padding:16px 14px 14px}.ip-target-label{font-size:11px}.ip-note-target{font-size:34px;margin-top:5px}.ip-radar{width:202px;height:142px}.ip-radar::before{width:120px;height:120px}.ip-radar::after{width:62px;height:62px}.ip-ball{width:38px;height:38px}.ip-prompt{padding:8px 15px;font-size:13px}
  .ip-feedback-card{min-height:78px;border-radius:20px;padding:12px 14px}.ip-feedback-title{font-size:10px;margin-bottom:10px}.ip-cents-scale{gap:6px}.ip-cents-scale i{width:8px;height:8px}.ip-cents-scale i.is-center{width:23px;height:23px}.ip-feedback-labels{font-size:12px;margin-top:9px}
  .ip-level-card{min-height:62px;border-radius:19px;padding:10px 13px;grid-template-columns:46px 1fr auto}.ip-level-card .ip-badge{width:38px;height:38px}.ip-level-card h2{font-size:12px}.ip-level-card p{font-size:12px}.ip-counter{height:36px;min-width:52px;font-size:14px}
  .ip-primary{min-height:56px;font-size:15px}
}
@media (max-width:380px){
  .ip-header,.ip-steps,.ip-stage{width:100%}.ip-title h1{font-size:31px}.ip-target-card{border-radius:26px}.ip-feedback-labels{font-size:11px}.ip-secondary-sound{width:48px;height:48px}.ip-secondary-sound-label{display:none}
}
`;
