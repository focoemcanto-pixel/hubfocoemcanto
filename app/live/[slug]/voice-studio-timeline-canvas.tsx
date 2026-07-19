'use client';

import { memo, useMemo, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { KeyboardMusic } from 'lucide-react';
import type {
  VoiceStudioAsset,
  VoiceStudioClip,
  VoiceStudioMidiNote,
  VoiceStudioProject,
  VoiceStudioTrack,
  VoiceStudioTrackKind,
} from './voice-studio-project-model';
import VoiceStudioTimelineRuler from './voice-studio-timeline-ruler';
import { timelineTimeToPixels, timelineTrackHeight, type TimelineViewport } from './voice-studio-timeline-engine';

type EditMode = 'move' | 'trim-left' | 'trim-right';

type TimelineCanvasProps = {
  project: VoiceStudioProject;
  duration: number;
  elapsed: number;
  viewport: TimelineViewport;
  zoom: number;
  contentWidth: number;
  verticalZoom: number;
  selectedIds?: ReadonlySet<string>;
  status?: 'idle' | 'countin' | 'recording' | 'playing';
  armedKind?: VoiceStudioTrackKind;
  recordStart?: number;
  livePeaks?: number[];
  readOnly?: boolean;
  onSeek?: (time: number) => void;
  onBackgroundClick?: (event: MouseEvent<HTMLElement>) => void;
  onSelectClip?: (event: ReactPointerEvent, clipId: string) => void;
  onBeginDrag?: (event: ReactPointerEvent, trackId: string, clipId: string, mode: EditMode) => void;
  onMoveDrag?: (event: ReactPointerEvent) => void;
  onEndDrag?: () => void;
  lasso?: { left: number; top: number; width: number; height: number } | null;
};

const CANVAS_CSS = `.vs-pro-canvas{position:relative;min-height:100%;overflow:hidden}.vs-pro-canvas-content{position:relative;min-height:100%;background-image:linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:var(--grid-step,56px) 100%}.vs-pro-canvas .vs-lane{position:relative}.vs-pro-canvas .vs-clip{position:absolute;top:9px;bottom:9px;height:auto;touch-action:none}.vs-pro-canvas.interactive .vs-clip{cursor:grab}.vs-pro-canvas .vs-live-clip{position:absolute;top:9px;bottom:9px;height:auto}.vs-pro-canvas .vs-playhead{position:absolute;top:0;bottom:0;z-index:7;pointer-events:none;will-change:transform}.vs-pro-canvas .vs-trim{display:none;position:absolute;top:0;bottom:0;width:10px;border:0;background:rgba(255,255,255,.88);z-index:6;cursor:ew-resize}.vs-pro-canvas.interactive .vs-clip.selected:not(.locked) .vs-trim{display:block}.vs-pro-canvas .vs-trim.left{left:0;border-radius:6px 0 0 6px}.vs-pro-canvas .vs-trim.right{right:0;border-radius:0 6px 6px 0}.vs-pro-canvas .vs-fade{position:absolute;top:0;bottom:0;pointer-events:none;opacity:.36}.vs-lasso{position:absolute;z-index:9;border:1px solid #a78bfa;background:rgba(139,92,246,.16);pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,.08) inset}.vs-pro-canvas .vs-fade.in{left:0;background:linear-gradient(90deg,#fff,transparent)}.vs-pro-canvas .vs-fade.out{right:0;background:linear-gradient(90deg,transparent,#fff)}`;

export default function VoiceStudioTimelineCanvas(props: TimelineCanvasProps) {
  const {
    project, duration, elapsed, viewport, zoom, contentWidth, verticalZoom,
    selectedIds = new Set<string>(), status = 'idle', armedKind = 'audio', recordStart = 0,
    livePeaks = [], readOnly = true, onSeek, onBackgroundClick, onSelectClip,
    onBeginDrag, onMoveDrag, onEndDrag, lasso = null,
  } = props;
  const recording = status === 'recording' || status === 'countin';
  const interactive = !readOnly && Boolean(onSelectClip && onBeginDrag && onMoveDrag && onEndDrag);
  const trackHeight = timelineTrackHeight(verticalZoom);
  const minHeight = 42 + (project.tracks.length + (recording ? 1 : 0)) * trackHeight;
  const gridStep = timelineTimeToPixels(60 / Math.max(20, project.tempo), zoom);

  return <div className={`vs-pro-canvas ${interactive ? 'interactive' : 'view-only'}`}>
    <style>{CANVAS_CSS}</style>
    <div className="vs-pro-canvas-content" style={{ width: contentWidth, minHeight, '--grid-step': `${gridStep}px` } as CSSProperties} onClick={onBackgroundClick}>
      <VoiceStudioTimelineRuler duration={duration} tempo={project.tempo} timeSignature={project.timeSignature} zoom={zoom} viewport={viewport} playhead={elapsed} loop={project.loop} onSeek={onSeek}/>
      <div className="vs-playhead" style={{ transform: `translateX(${timelineTimeToPixels(elapsed, zoom)}px)` }}/>
      {project.tracks.map(track => <TimelineLane key={track.id} track={track} assets={project.assets} zoom={zoom} selectedIds={selectedIds} interactive={interactive} onSelectClip={onSelectClip} onBeginDrag={onBeginDrag} onMoveDrag={onMoveDrag} onEndDrag={onEndDrag} trackHeight={trackHeight}/>)}
      {recording && <div className={`vs-lane live ${armedKind}`} style={{ height: trackHeight }}>
        <div className="vs-live-clip" style={{ left: timelineTimeToPixels(recordStart, zoom), width: Math.max(16, timelineTimeToPixels(Math.max(0, elapsed - recordStart), zoom)) }}>
          {armedKind === 'audio' ? <Wave peaks={livePeaks}/> : <div className="vs-midi-live"><KeyboardMusic/><span>Capturando MIDI…</span></div>}
        </div>
      </div>}
      {lasso && <div className="vs-lasso" style={lasso}/>} 
    </div>
  </div>;
}

function TimelineLane({ track, assets, zoom, selectedIds, interactive, onSelectClip, onBeginDrag, onMoveDrag, onEndDrag, trackHeight }: {
  track: VoiceStudioTrack; assets: Record<string, VoiceStudioAsset>; zoom: number; selectedIds: ReadonlySet<string>; interactive: boolean;
  onSelectClip?: (event: ReactPointerEvent, clipId: string) => void;
  onBeginDrag?: (event: ReactPointerEvent, trackId: string, clipId: string, mode: EditMode) => void;
  onMoveDrag?: (event: ReactPointerEvent) => void; onEndDrag?: () => void; trackHeight: number;
}) {
  return <div className={`vs-lane ${track.kind}`} style={{ height: trackHeight }}>
    {track.clips.map(clip => {
      const asset = assets[clip.assetId];
      if (!asset) return null;
      return <TimelineClip key={clip.id} track={track} clip={clip} asset={asset} zoom={zoom} selected={selectedIds.has(clip.id)} interactive={interactive} onSelectClip={onSelectClip} onBeginDrag={onBeginDrag} onMoveDrag={onMoveDrag} onEndDrag={onEndDrag}/>;
    })}
  </div>;
}

const TimelineClip = memo(function TimelineClip({ track, clip, asset, zoom, selected, interactive, onSelectClip, onBeginDrag, onMoveDrag, onEndDrag }: {
  track: VoiceStudioTrack; clip: VoiceStudioClip; asset: VoiceStudioAsset; zoom: number; selected: boolean; interactive: boolean;
  onSelectClip?: (event: ReactPointerEvent, clipId: string) => void;
  onBeginDrag?: (event: ReactPointerEvent, trackId: string, clipId: string, mode: EditMode) => void;
  onMoveDrag?: (event: ReactPointerEvent) => void; onEndDrag?: () => void;
}) {
  const style = { '--clip': clip.color || track.color, left: timelineTimeToPixels(clip.start, zoom), width: Math.max(12, timelineTimeToPixels(clip.duration, zoom)), opacity: clip.muted ? 0.45 : 1 } as CSSProperties;
  const fadeInWidth = Math.min(timelineTimeToPixels(clip.fadeIn || 0, zoom), Math.max(0, timelineTimeToPixels(clip.duration, zoom)));
  const fadeOutWidth = Math.min(timelineTimeToPixels(clip.fadeOut || 0, zoom), Math.max(0, timelineTimeToPixels(clip.duration, zoom) - fadeInWidth));
  const pointerProps = interactive ? {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => { onSelectClip?.(event, clip.id); onBeginDrag?.(event, track.id, clip.id, 'move'); },
    onPointerMove: onMoveDrag,
    onPointerUp: onEndDrag,
    onPointerCancel: onEndDrag,
  } : {};

  return <div className={`vs-clip ${selected ? 'selected' : ''} ${clip.locked ? 'locked' : ''}`} {...pointerProps} style={style}>
    <b>{clip.name}</b>
    {asset.kind === 'audio' ? <Wave peaks={asset.peaks} offset={clip.sourceOffset} duration={clip.duration} sourceDuration={asset.duration}/> : <MidiClip notes={asset.midiNotes} offset={clip.sourceOffset} duration={clip.duration}/>} 
    {clip.fadeIn > 0 && <i className="vs-fade in" style={{ width: fadeInWidth }}/>} 
    {clip.fadeOut > 0 && <i className="vs-fade out" style={{ width: fadeOutWidth }}/>} 
    {interactive && <><button type="button" aria-label={`Aparar início de ${clip.name}`} className="vs-trim left" onPointerDown={event => { event.stopPropagation(); onBeginDrag?.(event, track.id, clip.id, 'trim-left'); }}/><button type="button" aria-label={`Aparar fim de ${clip.name}`} className="vs-trim right" onPointerDown={event => { event.stopPropagation(); onBeginDrag?.(event, track.id, clip.id, 'trim-right'); }}/></>}
  </div>;
});

const Wave = memo(function Wave({ peaks, offset = 0, duration, sourceDuration }: { peaks: number[]; offset?: number; duration?: number; sourceDuration?: number }) {
  const visible = useMemo(() => {
    const values = peaks.length ? peaks : Array.from({ length: 80 }, () => 0.04);
    const total = Math.max(0.01, sourceDuration || duration || 1);
    const start = Math.floor(offset / total * values.length);
    const end = Math.max(start + 1, Math.ceil((offset + (duration || total)) / total * values.length));
    return values.slice(start, end);
  }, [duration, offset, peaks, sourceDuration]);
  return <svg className="vs-wave" viewBox={`0 0 ${Math.max(1, visible.length)} 100`} preserveAspectRatio="none">{visible.map((peak, index) => <line key={index} x1={index + 0.5} x2={index + 0.5} y1={50 - peak * 46} y2={50 + peak * 46}/>)}</svg>;
});

const MidiClip = memo(function MidiClip({ notes, offset, duration }: { notes: VoiceStudioMidiNote[]; offset: number; duration: number }) {
  const rendered = useMemo(() => notes.filter(note => note.start + note.duration > offset && note.start < offset + duration).map(note => {
    const start = Math.max(0, note.start - offset);
    const clippedDuration = Math.min(note.start + note.duration, offset + duration) - Math.max(note.start, offset);
    const top = ((84 - Math.min(84, Math.max(36, note.note))) / 48) * 100;
    return <i key={note.id} style={{ left: `${(start / Math.max(0.1, duration)) * 100}%`, width: `${Math.max(1.2, (clippedDuration / Math.max(0.1, duration)) * 100)}%`, top: `${top}%`, opacity: 0.45 + (note.velocity / 127) * 0.55 }}/>;
  }), [duration, offset, notes]);
  return <div className="vs-midi-notes">{rendered}</div>;
});