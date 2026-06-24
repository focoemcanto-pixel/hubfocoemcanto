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
  const labels = [96, 84, 72, 60, 48, 36, 24];
  const activeRegion = regionFromMidi(currentMidi);

  return (
    <div className="vocal-meter premium-vocal-meter" aria-label="Medidor visual de notas e registros vocais">
      <style>{meterCss}</style>
      <div className="vocal-meter-panel">
        <div className="vocal-meter-scale" aria-label="Escala vocal vertical">
          {labels.map((midi) => <span key={midi} style={{ top: `${percent(midi)}%` }}>{midiToBrazilianNoteName(midi)}</span>)}
          {lowestMidi != null && <b className="marker low" style={{ top: `${percent(lowestMidi)}%` }}>grave {midiToBrazilianNoteName(lowestMidi)}</b>}
          {highestMidi != null && <b className="marker high" style={{ top: `${percent(highestMidi)}%` }}>agudo {midiToBrazilianNoteName(highestMidi)}</b>}
          {currentMidi != null && <i className="active-note" style={{ top: `${percent(currentMidi)}%` }} aria-label={`Nota atual ${midiToBrazilianNoteName(currentMidi)}`} />}
        </div>
        <WireframeBody activeRegion={activeRegion} currentLabel={currentMidi != null ? midiToBrazilianNoteName(currentMidi) : undefined} />
      </div>
    </div>
  );
}

const meterCss = `.premium-vocal-meter{min-height:620px!important;border-radius:28px!important;background:rgba(0,0,0,.32)!important;border:1px solid rgba(255,255,255,.1);overflow:hidden}.premium-vocal-meter .vocal-meter-panel{position:absolute;inset:18px;display:grid;grid-template-columns:118px 1fr;gap:12px}.premium-vocal-meter .vocal-meter-scale{position:relative!important;inset:auto!important;border-left:2px solid rgba(245,199,107,.35);border-radius:18px;background:rgba(255,255,255,.035)}.premium-vocal-meter .vocal-meter-scale>span{position:absolute;left:14px;transform:translateY(-50%);font-weight:900;color:rgba(255,255,255,.76);font-size:13px}.premium-vocal-meter .active-note{left:-11px;width:22px;height:22px;background:#67e8f9;box-shadow:0 0 22px #67e8f9,0 0 44px rgba(245,199,107,.8);z-index:2}.premium-vocal-meter .marker{right:8px;font-size:11px;z-index:3;white-space:nowrap}@media(max-width:760px){.premium-vocal-meter{min-height:58vh!important}.premium-vocal-meter .vocal-meter-panel{inset:12px;grid-template-columns:76px 1fr}.premium-vocal-meter .vocal-meter-scale>span{left:10px;font-size:11px}}`;
