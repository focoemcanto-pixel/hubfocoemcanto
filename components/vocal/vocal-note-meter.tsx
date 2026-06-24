import { midiToBrazilianNoteName } from '@/lib/audio/pitch';
import { WireframeBody } from './wireframe-body';

type Props = { currentMidi?: number | null; lowestMidi?: number | null; highestMidi?: number | null; minMidi?: number; maxMidi?: number };

function regionFromMidi(midi?: number | null) {
  if (midi == null) return null;
  if (midi >= 72) return 'head';
  if (midi >= 55) return 'mix';
  return 'chest';
}

export function VocalNoteMeter({ currentMidi, lowestMidi, highestMidi, minMidi = 24, maxMidi = 96 }: Props) {
  const clamp = (midi: number) => Math.max(minMidi, Math.min(maxMidi, midi));
  const percent = (midi: number) => 100 - ((clamp(midi) - minMidi) / (maxMidi - minMidi)) * 100;
  const labels = Array.from({ length: maxMidi - minMidi + 1 }, (_, index) => maxMidi - index);
  const activeRegion = regionFromMidi(currentMidi);

  return (
    <div className="vocal-meter premium-vocal-meter" aria-label="Medidor visual de notas e registros vocais">
      <style>{meterCss}</style>
      <div className="vocal-meter-panel">
        <div className="vocal-meter-scale" aria-label="Escala vocal vertical">
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

const meterCss = `.premium-vocal-meter{position:relative;min-height:620px!important;border-radius:28px!important;background:rgba(0,0,0,.32)!important;border:1px solid rgba(255,255,255,.1);overflow:hidden}.premium-vocal-meter .vocal-meter-panel{position:absolute;inset:18px;display:grid;grid-template-columns:118px 1fr;gap:12px}.premium-vocal-meter .vocal-meter-scale{position:relative!important;inset:auto!important;border-left:2px solid rgba(245,199,107,.35);border-radius:18px;background:rgba(255,255,255,.035)}.premium-vocal-meter .vocal-meter-scale>span{position:absolute;left:14px;transform:translateY(-50%);font-weight:900;color:rgba(255,255,255,.42);font-size:10px;line-height:1}.premium-vocal-meter .vocal-meter-scale>span.octave{color:rgba(255,255,255,.78);font-size:13px}.premium-vocal-meter .active-note{position:absolute;left:-11px;width:22px;height:22px;background:#67e8f9;box-shadow:0 0 22px #67e8f9,0 0 44px rgba(245,199,107,.8);z-index:2}.premium-vocal-meter .marker{position:absolute;left:42px;transform:translateY(-50%);font-size:12px;z-index:3;white-space:nowrap;color:rgba(255,255,255,.74);text-shadow:0 0 14px rgba(0,0,0,.9);font-weight:900}.premium-vocal-meter .marker.high,.premium-vocal-meter .marker.low{background:transparent;padding:0}@media(max-width:760px){.premium-vocal-meter{min-height:72dvh!important;height:72dvh!important;border:0!important;border-radius:0!important;background:radial-gradient(circle at 72% 30%,rgba(255,255,255,.06),transparent 24%),rgba(0,0,0,.08)!important}.premium-vocal-meter .vocal-meter-panel{inset:0;grid-template-columns:96px minmax(0,1fr);gap:0}.premium-vocal-meter .vocal-meter-scale{border-radius:0;background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,255,255,.012));border-left:0;border-right:0}.premium-vocal-meter .vocal-meter-scale:before{content:'';position:absolute;left:66px;top:0;bottom:0;width:2px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.92) 35%,rgba(255,255,255,.92) 68%,rgba(255,255,255,.08));box-shadow:0 0 22px rgba(255,255,255,.22)}.premium-vocal-meter .vocal-meter-scale>span{left:16px;font-size:13px;color:rgba(255,255,255,.28)}.premium-vocal-meter .vocal-meter-scale>span.octave{font-size:15px;color:rgba(255,255,255,.92)}.premium-vocal-meter .active-note{left:50px;width:34px;height:34px;border-radius:999px;box-shadow:0 0 26px #67e8f9,0 0 58px rgba(103,232,249,.72)}.premium-vocal-meter .marker{left:82px;font-size:19px;letter-spacing:.02em;color:rgba(255,255,255,.72);font-family:inherit;text-transform:lowercase}.premium-vocal-meter .marker.high{top:auto}.premium-vocal-meter .marker.low{top:auto}}`;
