import { midiToBrazilianNoteName } from '@/lib/audio/pitch';
import { WireframeBody } from './wireframe-body';

type Props = { currentMidi?: number | null; lowestMidi?: number | null; highestMidi?: number | null; minMidi?: number; maxMidi?: number };

function regionFromMidi(midi?: number | null) {
  if (midi == null) return null;
  if (midi >= 72) return 'head';
  if (midi >= 55) return 'mix';
  return 'chest';
}

export function VocalNoteMeter({ currentMidi, lowestMidi, highestMidi, minMidi = 36, maxMidi = 84 }: Props) {
  const clamp = (midi: number) => Math.max(minMidi, Math.min(maxMidi, midi));
  const percent = (midi: number) => 100 - ((clamp(midi) - minMidi) / (maxMidi - minMidi)) * 100;
  const labels = Array.from({ length: Math.floor((maxMidi - minMidi) / 2) + 1 }, (_, index) => maxMidi - index * 2);
  const activeRegion = regionFromMidi(currentMidi);

  return (
    <div className="vocal-meter premium-vocal-meter" aria-label="Medidor visual de notas e registros vocais">
      <style>{meterCss}</style>
      <div className="vocal-meter-panel">
        <div className="vocal-meter-scale" aria-label="Escala vocal vertical">
          {labels.map((midi) => <span className={midi % 12 === 0 ? 'octave' : ''} key={midi} style={{ top: `${percent(midi)}%` }}>{midiToBrazilianNoteName(midi)}</span>)}
          {highestMidi != null && <b className="marker high" style={{ top: `${percent(highestMidi)}%` }} aria-label={`Nota mais aguda ${midiToBrazilianNoteName(highestMidi)}`} />}
          {lowestMidi != null && <b className="marker low" style={{ top: `${percent(lowestMidi)}%` }} aria-label={`Nota mais grave ${midiToBrazilianNoteName(lowestMidi)}`} />}
          {currentMidi != null && <i className="active-note" style={{ top: `${percent(currentMidi)}%` }} aria-label={`Nota atual ${midiToBrazilianNoteName(currentMidi)}`} />}
        </div>
        <WireframeBody activeRegion={activeRegion} currentMidi={currentMidi} currentLabel={currentMidi != null ? midiToBrazilianNoteName(currentMidi) : undefined} />
      </div>
    </div>
  );
}

const meterCss = `.premium-vocal-meter{position:relative;min-height:620px!important;border-radius:28px!important;background:rgba(0,0,0,.32)!important;border:1px solid rgba(255,255,255,.1);overflow:hidden}.premium-vocal-meter .vocal-meter-panel{position:absolute;inset:18px;display:grid;grid-template-columns:118px 1fr;gap:12px}.premium-vocal-meter .vocal-meter-scale{position:relative!important;inset:auto!important;border-left:2px solid rgba(245,199,107,.35);border-radius:18px;background:rgba(255,255,255,.035)}.premium-vocal-meter .vocal-meter-scale>span{position:absolute;left:14px;transform:translateY(-50%);font-weight:900;color:rgba(255,255,255,.42);font-size:10px;line-height:1}.premium-vocal-meter .vocal-meter-scale>span.octave{color:rgba(255,255,255,.78);font-size:13px}.premium-vocal-meter .active-note{position:absolute;left:-11px;width:22px;height:22px;background:#67e8f9;box-shadow:0 0 22px #67e8f9,0 0 44px rgba(245,199,107,.8);z-index:2}.premium-vocal-meter .marker{position:absolute;left:34px;width:74px;height:2px;transform:translateY(-50%);z-index:5;border-radius:99px}.premium-vocal-meter .marker.high{background:#67e8f9;box-shadow:0 0 14px rgba(103,232,249,.85)}.premium-vocal-meter .marker.low{background:#f5c76b;box-shadow:0 0 14px rgba(245,199,107,.78)}@media(max-width:760px){.premium-vocal-meter{min-height:100dvh!important;height:100dvh!important;border:0!important;border-radius:0!important;background:radial-gradient(circle at 72% 34%,rgba(103,232,249,.13),transparent 28%),radial-gradient(circle at 62% 68%,rgba(245,199,107,.11),transparent 30%),#050507!important}.premium-vocal-meter .vocal-meter-panel{inset:0;grid-template-columns:96px minmax(0,1fr);gap:0}.premium-vocal-meter .vocal-meter-scale{height:calc(100dvh - 196px);margin:88px 0 108px;border-radius:0;background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,255,255,.006));border:0;overflow:visible}.premium-vocal-meter .vocal-meter-scale:before{content:'';position:absolute;left:64px;top:0;bottom:0;width:2px;background:linear-gradient(180deg,rgba(103,232,249,.95),rgba(103,232,249,.95) 58%,rgba(245,199,107,.95) 58%,rgba(245,199,107,.95));box-shadow:0 0 18px rgba(103,232,249,.36)}.premium-vocal-meter .vocal-meter-scale:after{content:'';position:absolute;left:64px;top:0;bottom:0;width:24px;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.34) 0 1px,transparent 1px calc((100dvh - 196px)/24));opacity:.7}.premium-vocal-meter .vocal-meter-scale>span{left:14px;font-size:12px;color:rgba(255,255,255,.64);letter-spacing:-.03em;z-index:2}.premium-vocal-meter .vocal-meter-scale>span.octave{font-size:15px;color:rgba(255,255,255,.98);font-weight:1000}.premium-vocal-meter .active-note{left:48px;width:34px;height:34px;border-radius:999px;box-shadow:0 0 30px #67e8f9,0 0 68px rgba(103,232,249,.76);z-index:6}.premium-vocal-meter .marker{left:64px;width:42px;height:3px;z-index:7}.premium-vocal-meter .marker.high{background:#67e8f9;box-shadow:0 0 16px rgba(103,232,249,.72)}.premium-vocal-meter .marker.low{background:#f5c76b;box-shadow:0 0 16px rgba(245,199,107,.72)}}`;
