'use client';

import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { VoiceStudioAsset, VoiceStudioClip, VoiceStudioTrack } from './voice-studio-project-model';
import type { VoiceStudioSession } from './voice-studio-session-types';
import { timelineContentWidth, timelineTimeToPixels, timelineTrackHeight } from './voice-studio-timeline-engine';
import {
  createVoiceStudioTimelineViewModel,
  voiceStudioTimelineDuration,
  type VoiceStudioTimelineViewModel,
} from './voice-studio-timeline-view-model';

export type VoiceStudioTimelineViewProps = {
  session: VoiceStudioSession;
  width?: number;
  height?: number;
};

const TIMELINE_VIEW_CSS = `.vs-session-timeline{position:relative;overflow:auto;min-height:240px;background:#11151d;color:#e5e7eb}.vs-session-timeline-content{position:relative;min-height:100%;background-image:linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:56px 100%}.vs-session-timeline-ruler{position:sticky;top:0;z-index:8;height:34px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(17,21,29,.96)}.vs-session-timeline-ruler span{position:absolute;bottom:7px;font-size:10px;color:#94a3b8;transform:translateX(4px)}.vs-session-timeline-lane{position:relative;border-bottom:1px solid rgba(255,255,255,.06)}.vs-session-timeline-clip{position:absolute;top:9px;bottom:9px;min-width:12px;border-radius:7px;overflow:hidden;background:color-mix(in srgb,var(--clip) 72%,#111827);border:1px solid color-mix(in srgb,var(--clip) 82%,white);box-shadow:0 6px 18px rgba(0,0,0,.2)}.vs-session-timeline-clip b{position:absolute;z-index:2;left:8px;top:5px;max-width:calc(100% - 16px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.vs-session-timeline-wave{position:absolute;inset:24px 5px 5px;width:calc(100% - 10px);height:calc(100% - 29px)}.vs-session-timeline-wave line{stroke:rgba(255,255,255,.72);stroke-width:1}.vs-session-timeline-midi{position:absolute;inset:24px 5px 5px}.vs-session-timeline-midi i{position:absolute;height:4px;border-radius:3px;background:rgba(255,255,255,.75)}.vs-session-timeline-playhead{position:absolute;top:0;bottom:0;width:1px;background:#f8fafc;box-shadow:0 0 0 1px rgba(139,92,246,.7);z-index:7;pointer-events:none}.vs-session-timeline-status{position:sticky;left:8px;top:6px;z-index:10;display:inline-flex;padding:3px 7px;border-radius:999px;background:rgba(15,23,42,.88);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}`;

export default function VoiceStudioTimelineView({ session, width = 960, height = 360 }: VoiceStudioTimelineViewProps) {
  const [model, setModel] = useState<VoiceStudioTimelineViewModel>(() => createVoiceStudioTimelineViewModel(session));

  useEffect(() => {
    const refreshProject = () => setModel(current => ({
      ...current,
      project: session.project,
      duration: voiceStudioTimelineDuration(session.project),
    }));
    const refreshTransport = () => {
      const snapshot = session.transport.getSnapshot();
      setModel(current => ({ ...current, playhead: snapshot.playhead, status: snapshot.status }));
    };

    const unsubscribe = [
      session.eventBus.subscribe('PROJECT_CHANGED', refreshProject),
      session.eventBus.subscribe('TRACK_UPDATED', refreshProject),
      session.eventBus.subscribe('PLAYHEAD_CHANGED', ({ playhead }) => setModel(current => ({ ...current, playhead }))),
      session.eventBus.subscribe('PLAY_STARTED', refreshTransport),
      session.eventBus.subscribe('PLAY_STOPPED', refreshTransport),
      session.eventBus.subscribe('RECORD_STARTED', refreshTransport),
      session.eventBus.subscribe('RECORD_STOPPED', refreshTransport),
      session.eventBus.subscribe('ASSET_IMPORTED', refreshProject),
    ];

    refreshProject();
    refreshTransport();
    return () => unsubscribe.forEach(release => release());
  }, [session]);

  const zoom = Math.max(0.5, model.project.view.zoom || 1);
  const verticalZoom = Math.max(0.6, model.project.view.verticalZoom || 1);
  const contentWidth = timelineContentWidth(model.duration, width, zoom);
  const trackHeight = timelineTrackHeight(verticalZoom);
  const minHeight = 34 + model.project.tracks.length * trackHeight;
  const rulerMarks = useMemo(() => Array.from({ length: Math.floor(model.duration) + 1 }, (_, second) => second), [model.duration]);

  return <section className="vs-session-timeline" style={{ width, height }} data-status={model.status} aria-label="Timeline do Voice Studio">
    <style>{TIMELINE_VIEW_CSS}</style>
    <div className="vs-session-timeline-content" style={{ width: contentWidth, minHeight }}>
      <div className="vs-session-timeline-ruler">
        <span className="vs-session-timeline-status">{model.status}</span>
        {rulerMarks.map(second => <span key={second} style={{ left: timelineTimeToPixels(second, zoom) }}>{second}s</span>)}
      </div>
      <div className="vs-session-timeline-playhead" style={{ transform: `translateX(${timelineTimeToPixels(model.playhead, zoom)}px)` }} />
      {model.project.tracks.map(track => <TimelineLane key={track.id} track={track} assets={model.project.assets} zoom={zoom} height={trackHeight} />)}
    </div>
  </section>;
}

function TimelineLane({ track, assets, zoom, height }: { track: VoiceStudioTrack; assets: Record<string, VoiceStudioAsset>; zoom: number; height: number }) {
  return <div className="vs-session-timeline-lane" style={{ height }}>
    {track.clips.map(clip => {
      const asset = assets[clip.assetId];
      return asset ? <TimelineClip key={clip.id} track={track} clip={clip} asset={asset} zoom={zoom} /> : null;
    })}
  </div>;
}

const TimelineClip = memo(function TimelineClip({ track, clip, asset, zoom }: { track: VoiceStudioTrack; clip: VoiceStudioClip; asset: VoiceStudioAsset; zoom: number }) {
  const style = {
    '--clip': clip.color || track.color,
    left: timelineTimeToPixels(clip.start, zoom),
    width: Math.max(12, timelineTimeToPixels(clip.duration, zoom)),
    opacity: clip.muted ? 0.45 : 1,
  } as CSSProperties;

  return <div className="vs-session-timeline-clip" style={style} data-clip-id={clip.id}>
    <b>{clip.name}</b>
    {asset.kind === 'audio'
      ? <Wave peaks={asset.peaks} />
      : <div className="vs-session-timeline-midi">{asset.midiNotes.map(note => <i key={note.id} style={{
        left: `${Math.max(0, Math.min(100, ((note.start - clip.sourceOffset) / Math.max(0.1, clip.duration)) * 100))}%`,
        width: `${Math.max(1, Math.min(100, (note.duration / Math.max(0.1, clip.duration)) * 100))}%`,
        top: `${Math.max(0, Math.min(92, ((84 - note.note) / 48) * 100))}%`,
      }} />)}</div>}
  </div>;
});

const Wave = memo(function Wave({ peaks }: { peaks: number[] }) {
  const values = peaks.length ? peaks : Array.from({ length: 80 }, () => 0.04);
  return <svg className="vs-session-timeline-wave" viewBox={`0 0 ${values.length} 100`} preserveAspectRatio="none">
    {values.map((peak, index) => <line key={index} x1={index + 0.5} x2={index + 0.5} y1={50 - peak * 46} y2={50 + peak * 46} />)}
  </svg>;
});
