'use client';

import { useMemo } from 'react';
import {
  createTimelineTicks,
  timelineContentWidth,
  timelinePixelsToTime,
  timelineTimeToPixels,
  type TimelineViewport,
} from './voice-studio-timeline-engine';

export type VoiceStudioTimelineRulerProps = {
  duration: number;
  tempo: number;
  timeSignature: [number, number];
  zoom: number;
  viewport: TimelineViewport;
  playhead: number;
  loop?: {
    enabled: boolean;
    start: number;
    end: number;
  };
  onSeek?: (time: number) => void;
};

const RULER_CSS = `.vs-pro-ruler{position:relative;height:42px;border-bottom:1px solid #2d323d;background:linear-gradient(180deg,#171a22,#12151c);user-select:none}.vs-pro-ruler-track{position:relative;height:100%;min-width:100%}.vs-pro-tick{position:absolute;bottom:0;width:1px;background:#3b414f;pointer-events:none}.vs-pro-tick.subdivision{height:8px;opacity:.46}.vs-pro-tick.beat{height:14px;opacity:.76}.vs-pro-tick.bar{height:23px;background:#747d92}.vs-pro-tick span{position:absolute;left:6px;top:-13px;color:#aeb6c8;font-size:10px;font-variant-numeric:tabular-nums}.vs-pro-playhead-cap{position:absolute;top:0;z-index:8;width:11px;height:11px;transform:translateX(-5px);border-radius:2px 2px 6px 6px;background:#f43f5e;box-shadow:0 0 0 1px rgba(255,255,255,.32)}.vs-pro-loop{position:absolute;top:0;bottom:0;background:rgba(139,92,246,.12);border-left:1px solid rgba(167,139,250,.8);border-right:1px solid rgba(167,139,250,.8);pointer-events:none}`;

export default function VoiceStudioTimelineRuler({
  duration,
  tempo,
  timeSignature,
  zoom,
  viewport,
  playhead,
  loop,
  onSeek,
}: VoiceStudioTimelineRulerProps) {
  const width = timelineContentWidth(duration, viewport.width, zoom);
  const ticks = useMemo(
    () => createTimelineTicks({ duration, tempo, timeSignature, zoom, viewport }),
    [duration, tempo, timeSignature, zoom, viewport],
  );

  function seek(event: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const absoluteX = localX + viewport.scrollLeft;
    onSeek(Math.min(duration, timelinePixelsToTime(absoluteX, zoom)));
  }

  const loopStart = loop?.enabled ? timelineTimeToPixels(loop.start, zoom) : 0;
  const loopWidth = loop?.enabled ? Math.max(0, timelineTimeToPixels(loop.end - loop.start, zoom)) : 0;

  return <div className="vs-pro-ruler" onClick={seek} role="presentation">
    <style>{RULER_CSS}</style>
    <div className="vs-pro-ruler-track" style={{ width }}>
      {loop?.enabled && loop.end > loop.start && <div className="vs-pro-loop" style={{ left: loopStart, width: loopWidth }}/>} 
      {ticks.map(tick => <i key={tick.id} className={`vs-pro-tick ${tick.kind}`} style={{ left: tick.left }}>
        {tick.label && <span>{tick.label}</span>}
      </i>)}
      <b className="vs-pro-playhead-cap" style={{ left: timelineTimeToPixels(playhead, zoom) }}/>
    </div>
  </div>;
}
