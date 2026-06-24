import { midiToBrazilianNoteName } from '@/lib/audio/pitch';

type Props = { currentMidi?: number | null; lowestMidi?: number | null; highestMidi?: number | null; minMidi?: number; maxMidi?: number };

export function VocalNoteMeter({ currentMidi, lowestMidi, highestMidi, minMidi = 24, maxMidi = 96 }: Props) {
  const clamp = (midi: number) => Math.max(minMidi, Math.min(maxMidi, midi));
  const percent = (midi: number) => 100 - ((clamp(midi) - minMidi) / (maxMidi - minMidi)) * 100;
  const labels = [96, 84, 72, 60, 48, 36, 24];

  return (
    <div className="vocal-meter" aria-label="Medidor vertical de notas vocais">
      <div className="vocal-meter-regions" aria-hidden="true"><span>Agudo / Cabeça</span><span>Médio / Misto</span><span>Grave / Peito</span></div>
      <div className="vocal-meter-scale">
        {labels.map((midi) => <span key={midi} style={{ top: `${percent(midi)}%` }}>{midiToBrazilianNoteName(midi)}</span>)}
        {lowestMidi != null && <b className="marker low" style={{ top: `${percent(lowestMidi)}%` }}>grave {midiToBrazilianNoteName(lowestMidi)}</b>}
        {highestMidi != null && <b className="marker high" style={{ top: `${percent(highestMidi)}%` }}>agudo {midiToBrazilianNoteName(highestMidi)}</b>}
        {currentMidi != null && <i className="active-note" style={{ top: `${percent(currentMidi)}%` }} aria-label={`Nota atual ${midiToBrazilianNoteName(currentMidi)}`} />}
      </div>
    </div>
  );
}
