import { midiToBrazilianNoteName } from '@/lib/audio/pitch';
import { WireframeBody } from './wireframe-body';

type Props = { currentMidi?: number | null; lowestMidi?: number | null; highestMidi?: number | null; minMidi?: number; maxMidi?: number };

function regionFromMidi(midi?: number | null) {
  if (midi == null) return null;
  if (midi >= 72) return 'head';
  if (midi >= 55) return 'mix';
  return 'chest';
}

export function VocalNoteMeter({ currentMidi, lowestMidi, highestMidi, minMidi = 36, maxMidi = 96 }: Props) {
  const clamp = (midi: number) => Math.max(minMidi, Math.min(maxMidi, midi));
  const percent = (midi: number) => 100 - ((clamp(midi) - minMidi) / (maxMidi - minMidi)) * 100;
  const labels = Array.from({ length: maxMidi - minMidi + 1 }, (_, index) => maxMidi - index);
  const activeRegion = regionFromMidi(currentMidi);

  return (
    <div className="vocal-meter premium-vocal-meter" aria-label="Medidor visual de notas e registros vocais">
      <style>{meterCss}</style>
      <div className="vocal-meter-panel">
        <div className="vocal-meter-scale" aria-label="Escala vocal vertical">
          <em className="scale-region region-head">Cabeça</em>
          <em className="scale-region region-mix">Voz mista</em>
          <em className="scale-region region-low">Grave</em>
          {labels.map((midi) => <span className={midi % 12 === 0 ? 'octave' : ''} key={midi} style={{ top: `${percent(midi)}%` }}>{midiToBrazilianNoteName(midi)}</span>)}
          {highestMidi != null && <b className="marker high" style={{ top: `${percent(highestMidi)}%` }}>← sua mais alta</b>}
          {lowestMidi != null && <b className="marker low" style={{ top: `${percent(lowestMidi)}%` }}>← sua mais baixa</b>}
          {currentMidi != null && <i className="active-note" style={{ top: `${percent(currentMidi)}%` }} aria-label={`Nota atual ${midiToBrazilianNoteName(currentMidi)}`} />}
        </div>
        <WireframeBody activeRegion={activeRegion} currentMidi={currentMidi} currentLabel={currentMidi != null ? midiToBrazilianNoteName(currentMidi) : undefined} />
      </div>
    </div>
  );
}

const meterCss = `.premium-vocal-meter{position:relative;min-height:620px!important;border-radius:28px!important;background:rgba(0,0,0,.32)!important;border:1px solid rgba(255,255,255,.1);overflow:hidden}.premium-vocal-meter .vocal-meter-panel{position:absolute;inset:18px;display:grid;grid-template-columns:118px 1fr;gap:12px}.premium-vocal-meter .vocal-meter-scale{position:relative!important;inset:auto!important;border-left:2px solid rgba(245,199,107,.35);border-radius:18px;background:rgba(255,255,255,.035)}.premium-vocal-meter .vocal-meter-scale>span{position:absolute;left:14px;transform:translateY(-50%);font-weight:900;color:rgba(255,255,255,.42);font-size:10px;line-height:1}.premium-vocal-meter .vocal-meter-scale>span.octave{color:rgba(255,255,255,.78);font-size:13px}.premium-vocal-meter .active-note{position:absolute;left:-11px;width:22px;height:22px;background:#67e8f9;box-shadow:0 0 22px #67e8f9,0 0 44px rgba(245,199,107,.8);z-index:2}.premium-vocal-meter .marker{position:absolute;left:42px;transform:translateY(-50%);font-size:12px;z-index:3;white-space:nowrap;color:rgba(255,255,255,.74);text-shadow:0 0 14px rgba(0,0,0,.9);font-weight:900}.scale-region{display:none}.premium-vocal-meter .marker.high,.premium-vocal-meter .marker.low{background:transparent;padding:0}@media(max-width:760px){.premium-vocal-meter{min-height:100dvh!important;height:100dvh!important;border:0!important;border-radius:0!important;background:radial-gradient(circle at 72% 34%,rgba(103,232,249,.13),transparent 28%),radial-gradient(circle at 62% 68%,rgba(245,199,107,.12),transparent 30%),#050507!important}.premium-vocal-meter .vocal-meter-panel{inset:0 0 0 0;grid-template-columns:112px minmax(0,1fr);gap:0}.premium-vocal-meter .vocal-meter-scale{height:calc(100dvh - 164px);margin:72px 0 92px;border-radius:0;background:linear-gradient(90deg,rgba(255,255,255,.035),rgba(255,255,255,.008));border-left:0;border-right:0;overflow:visible}.premium-vocal-meter .vocal-meter-scale:before{content:'';position:absolute;left:70px;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#21d4df 0%,#21d4df 54%,#f5c76b 54%,#f5c76b 100%);box-shadow:0 0 18px rgba(103,232,249,.4)}.premium-vocal-meter .vocal-meter-scale:after{content:'';position:absolute;left:70px;top:0;bottom:0;width:58px;background:repeating-linear-gradient(to bottom,transparent 0,transparent calc((100dvh - 164px)/60 - 1px),rgba(255,255,255,.36) calc((100dvh - 164px)/60 - 1px),rgba(255,255,255,.36) calc((100dvh - 164px)/60));opacity:.9;mask-image:linear-gradient(90deg,#000 0 20px,transparent 20px)}.premium-vocal-meter .vocal-meter-scale>span{left:24px;font-size:12px;color:rgba(255,255,255,.48);letter-spacing:-.02em;z-index:2}.premium-vocal-meter .vocal-meter-scale>span.octave{font-size:17px;color:rgba(255,255,255,.96);font-weight:1000}.premium-vocal-meter .active-note{left:52px;width:42px;height:42px;border-radius:999px;box-shadow:0 0 30px #67e8f9,0 0 68px rgba(103,232,249,.76);z-index:6}.premium-vocal-meter .marker{left:92px;font-size:18px;letter-spacing:.01em;color:rgba(255,255,255,.78);font-family:inherit;text-transform:lowercase;z-index:7}.premium-vocal-meter .marker.high{color:#67e8f9;text-shadow:0 0 16px rgba(103,232,249,.72)}.premium-vocal-meter .marker.low{color:#f5c76b;text-shadow:0 0 16px rgba(245,199,107,.72)}.scale-region{display:block;position:absolute;left:6px;transform:translateY(-50%);font-style:normal;font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.04em;z-index:3}.region-head{top:14%;color:#21d4df}.region-mix{top:42%;color:#21d4df}.region-low{top:76%;color:#f5c76b}}`;
