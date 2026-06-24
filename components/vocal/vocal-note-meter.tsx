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
    <div className="vocal-meter" aria-label="Medidor visual de notas e registros vocais">
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
