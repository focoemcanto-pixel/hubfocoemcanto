'use client';

import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { KeyboardMusic, Mic2, Circle } from 'lucide-react';
import type {
  VoiceStudioAsset,
  VoiceStudioClip,
  VoiceStudioMidiNote,
  VoiceStudioProject,
  VoiceStudioTrack,
  VoiceStudioTrackKind,
} from './voice-studio-project-model';
import VoiceStudioTimelineRuler from './voice-studio-timeline-ruler';
import {
  timelineTimeToPixels,
  type TimelineViewport,
} from './voice-studio-timeline-engine';

type EditMode = 'move' | 'trim-left' | 'trim-right';

type TimelineCanvasProps = {
  project: VoiceStudioProject;
  duration: number;
  elapsed: number;
  viewport: TimelineViewport;
  zoom: number;
  contentWidth: number;
  selectedIds: Set<string>;
  status: 'idle' | 'countin' | 'recording' | 'playing';
  armedKind: VoiceStudioTrackKind;
  recordStart: number;
  livePeaks: number[];
  readOnly: boolean;
  onSeek: (time: number) => void;
  onBackgroundClick: (event: MouseEvent<HTMLElement>) => void;
  onSelectClip: (event: ReactPointerEvent, clipId: string) => void;
  onBeginDrag: (event: ReactPointerEvent, trackId: string, clipId: string, mode: EditMode) => void;
  onMoveDrag: (event: ReactPointerEvent) => void;
  onEndDrag: () => void;
  onBeginRecord: () => void;
};

const CANVAS_CSS = `.vs-pro-canvas{position:relative;min-height:100%;overflow:hidden}.vs-pro-canvas-content{position:relative;min-height:100%}.vs-pro-canvas .vs-lane{position:relative}.vs-pro-canvas .vs-clip{position:absolute;top:9px;bottom:9px;height:auto;cursor:grab;touch-action:none}.vs-pro-canvas .vs-live-clip{position:absolute;top:9px;bottom:9px;height:auto}.vs-pro-canvas .vs-playhead{position:absolute;top:0;bottom:0;z-index:7;pointer-events:none}.vs-pro-canvas .vs-empty{inset:42px 0 0}`;

export default function VoiceStudioTimelineCanvas({
  project,
  duration,
  elapsed,
  viewport,
  zoom,
  contentWidth,
  selectedIds,
  status,
  armedKind,
  recordStart,
  livePeaks,
  readOnly,
  onSeek,
  onBackgroundClick,
  onSelectClip,
  onBeginDrag,
  onMoveDrag,
  onEndDrag,
  onBeginRecord,
}: TimelineCanvasProps) {
  const recording = status === 'recording' || status === 'countin';

  return <div className="vs-pro-canvas">
    <style>{CANVAS_CSS}</style>
    <div className="vs-pro-canvas-content" style={{ width: contentWidth }} onClick={onBackgroundClick}>
      <VoiceStudioTimelineRuler
        duration={duration}
        tempo={project.tempo}
        timeSignature={project.timeSignature}
        zoom={zoom}
        viewport={viewport}
        playhead={elapsed}
        loop={project.loop}
        onSeek={onSeek}
      />
      <div className="vs-playhead" style={{ left: timelineTimeToPixels(elapsed, zoom) }}/>
      {project.tracks.map(track => <TimelineLane
        key={track.id}
        track={track}
        assets={project.assets}
        zoom={zoom}
        selectedIds={selectedIds}
        onSelectClip={onSelectClip}
        onBeginDrag={onBeginDrag}
        onMoveDrag={onMoveDrag}
        onEndDrag={onEndDrag}
      />)}
      {recording && <div className={`vs-lane live ${armedKind}`}>
        <div className="vs-live-clip" style={{
          left: timelineTimeToPixels(recordStart, zoom),
          width: Math.max(16, timelineTimeToPixels(Math.max(0, elapsed - recordStart), zoom)),
        }}>
          {armedKind === 'audio'
            ? <Wave peaks={livePeaks}/>
            : <div className="vs-midi-live"><KeyboardMusic/><span>Capturando MIDI…</span></div>}
        </div>
      </div>}
      {!hasContent(project) && status === 'idle' && <div className="vs-empty">
        {armedKind === 'midi' ? <KeyboardMusic/> : <Mic2/>}
        <strong>{armedKind === 'midi' ? 'Grave seu teclado MIDI' : 'Grave a voz principal'}</strong>
        <span>Tracks são containers. Toda gravação cria um Asset e um Clip referenciado na timeline.</span>
        <button onClick={event => { event.stopPropagation(); onBeginRecord(); }} disabled={readOnly}>
          <Circle fill="currentColor"/> Criar primeira faixa
        </button>
      </div>}
    </div>
  </div>;
}

function TimelineLane({
  track,
  assets,
  zoom,
  selectedIds,
  onSelectClip,
  onBeginDrag,
  onMoveDrag,
  onEndDrag,
}: {
  track: VoiceStudioTrack;
  assets: Record<string, VoiceStudioAsset>;
  zoom: number;
  selectedIds: Set<string>;
  onSelectClip: (event: ReactPointerEvent, clipId: string) => void;
  onBeginDrag: (event: ReactPointerEvent, trackId: string, clipId: string, mode: EditMode) => void;
  onMoveDrag: (event: ReactPointerEvent) => void;
  onEndDrag: () => void;
}) {
  return <div className={`vs-lane ${track.kind}`}>
    {track.clips.map(clip => {
      const asset = assets[clip.assetId];
      if (!asset) return null;
      return <TimelineClip
        key={clip.id}
        track={track}
        clip={clip}
        asset={asset}
        zoom={zoom}
        selected={selectedIds.has(clip.id)}
        onSelectClip={onSelectClip}
        onBeginDrag={onBeginDrag}
        onMoveDrag={onMoveDrag}
        onEndDrag={onEndDrag}
      />;
    })}
  </div>;
}

function TimelineClip({
  track,
  clip,
  asset,
  zoom,
  selected,
  onSelectClip,
  onBeginDrag,
  onMoveDrag,
  onEndDrag,
}: {
  track: VoiceStudioTrack;
  clip: VoiceStudioClip;
  asset: VoiceStudioAsset;
  zoom: number;
  selected: boolean;
  onSelectClip: (event: ReactPointerEvent, clipId: string) => void;
  onBeginDrag: (event: ReactPointerEvent, trackId: string, clipId: string, mode: EditMode) => void;
  onMoveDrag: (event: ReactPointerEvent) => void;
  onEndDrag: () => void;
}) {
  const style = {
    '--clip': clip.color || track.color,
    left: timelineTimeToPixels(clip.start, zoom),
    width: Math.max(12, timelineTimeToPixels(clip.duration, zoom)),
    opacity: clip.muted ? 0.45 : 1,
  } as CSSProperties;

  return <div
    className={`vs-clip ${selected ? 'selected' : ''} ${clip.locked ? 'locked' : ''}`}
    onPointerDown={event => {
      onSelectClip(event, clip.id);
      onBeginDrag(event, track.id, clip.id, 'move');
    }}
    onPointerMove={onMoveDrag}
    onPointerUp={onEndDrag}
    onPointerCancel={onEndDrag}
    style={style}
  >
    <button
      className="vs-trim left"
      aria-label="Aparar início"
      onPointerDown={event => onBeginDrag(event, track.id, clip.id, 'trim-left')}
      onPointerMove={onMoveDrag}
      onPointerUp={onEndDrag}
    />
    <b>{clip.name}</b>
    {asset.kind === 'audio'
      ? <Wave peaks={asset.peaks} offset={clip.sourceOffset} duration={clip.duration} sourceDuration={asset.duration}/>
      : <MidiClip notes={asset.midiNotes} offset={clip.sourceOffset} duration={clip.duration}/>} 
    <button
      className="vs-trim right"
      aria-label="Aparar final"
      onPointerDown={event => onBeginDrag(event, track.id, clip.id, 'trim-right')}
      onPointerMove={onMoveDrag}
      onPointerUp={onEndDrag}
    />
  </div>;
}

function Wave({
  peaks,
  offset = 0,
  duration,
  sourceDuration,
}: {
  peaks: number[];
  offset?: number;
  duration?: number;
  sourceDuration?: number;
}) {
  const values = peaks.length ? peaks : Array.from({ length: 80 }, () => 0.04);
  const total = Math.max(0.01, sourceDuration || duration || 1);
  const start = Math.floor(offset / total * values.length);
  const end = Math.max(start + 1, Math.ceil((offset + (duration || total)) / total * values.length));
  const visible = values.slice(start, end);
  return <svg className="vs-wave" viewBox={`0 0 ${Math.max(1, visible.length)} 100`} preserveAspectRatio="none">
    {visible.map((peak, index) => <line key={index} x1={index + 0.5} x2={index + 0.5} y1={50 - peak * 46} y2={50 + peak * 46}/>)}
  </svg>;
}

function MidiClip({ notes, offset, duration }: { notes: VoiceStudioMidiNote[]; offset: number; duration: number }) {
  const visible = notes.filter(note => note.start + note.duration > offset && note.start < offset + duration);
  return <div className="vs-midi-notes">
    {visible.map(note => {
      const start = Math.max(0, note.start - offset);
      const clippedDuration = Math.min(note.start + note.duration, offset + duration) - Math.max(note.start, offset);
      const top = ((84 - Math.min(84, Math.max(36, note.note))) / 48) * 100;
      return <i key={note.id} style={{
        left: `${(start / Math.max(0.1, duration)) * 100}%`,
        width: `${Math.max(1.2, (clippedDuration / Math.max(0.1, duration)) * 100)}%`,
        top: `${top}%`,
        opacity: 0.45 + (note.velocity / 127) * 0.55,
      }}/>;
    })}
  </div>;
}

function hasContent(project: VoiceStudioProject) {
  return project.tracks.some(track => track.clips.length > 0);
}
