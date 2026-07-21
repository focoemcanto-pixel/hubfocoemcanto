'use client';

import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { projectDuration, type VoiceStudioProject } from './voice-studio-project-model';
import { playbackProjectRange, VoiceStudioPlaybackEngine, type VoiceStudioPlaybackMode } from './voice-studio-playback-engine';

type Status = 'idle' | 'countin' | 'recording' | 'playing';

type UseVoiceStudioTransportOptions = {
  readonly project: VoiceStudioProject;
  readonly objectUrlsRef: RefObject<Record<string, string>>;
  readonly selectionRange: { start: number; end: number } | null;
  readonly getAudioContext: () => AudioContext;
  readonly midiFrequency: (note: number) => number;
  readonly instrumentWave: (instrument: string) => OscillatorType;
  readonly projectHasContent: (project: VoiceStudioProject) => boolean;
  readonly quantize: (time: number) => number;
  readonly setProject: Dispatch<SetStateAction<VoiceStudioProject>>;
  readonly ensureTimeVisible: (time: number, force?: boolean) => void;
};

export type VoiceStudioTransport = {
  readonly status: Status;
  readonly elapsed: number;
  readonly countBeat: number;
  readonly startAtRef: RefObject<number>;
  readonly recordStartRef: RefObject<number>;
  readonly setStatus: Dispatch<SetStateAction<Status>>;
  readonly setElapsed: Dispatch<SetStateAction<number>>;
  readonly play: (mode?: VoiceStudioPlaybackMode) => void;
  readonly pause: () => void;
  readonly stop: (reset?: boolean) => void;
  readonly clearPlayback: (reset?: boolean) => void;
  readonly seek: (time: number) => void;
  readonly countIn: () => Promise<void>;
  readonly startRecordingClock: () => void;
  readonly cleanupCapture: () => void;
  readonly startBackingTracks: (offset: number) => void;
  readonly cleanup: () => void;
};

export function useVoiceStudioTransport({ project, objectUrlsRef, selectionRange, getAudioContext, midiFrequency, instrumentWave, projectHasContent, quantize, setProject, ensureTimeVisible }: UseVoiceStudioTransportOptions): VoiceStudioTransport {
  const [status, setStatus] = useState<Status>('idle');
  const [countBeat, setCountBeat] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);
  const metroRef = useRef<number | null>(null);
  const countInTimerRef = useRef<number | null>(null);
  const playbackEngineRef = useRef<VoiceStudioPlaybackEngine | null>(null);
  const startAtRef = useRef(0);
  const recordStartRef = useRef(0);

  const duration = Math.max(projectDuration(project), elapsed);
  const contentRange = playbackProjectRange(project);
  const contentEnd = contentRange?.end ?? 0;
  const beatSeconds = 60 / project.tempo;

  const setPlayhead = useCallback((time: number) => {
    setElapsed(time);
    setProject(current => ({ ...current, view: { ...current.view, playhead: time } }));
  }, [setProject]);

  const playbackEngine = useCallback(() => {
    playbackEngineRef.current ||= new VoiceStudioPlaybackEngine({
      getAudioContext,
      midiFrequency,
      instrumentWave,
      onTick: (time) => {
        setPlayhead(time);
        ensureTimeVisible(time);
      },
      onEnded: (time, reason) => {
        setPlayhead(time);
        if (reason !== 'loop') setStatus('idle');
      },
    });
    return playbackEngineRef.current;
  }, [ensureTimeVisible, getAudioContext, instrumentWave, midiFrequency, setPlayhead]);

  const click = useCallback((accent = false) => {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = accent ? 1320 : 930;
    gain.gain.setValueAtTime(0.16, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.055);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.06);
  }, [getAudioContext]);

  const stopMetronome = useCallback(() => {
    if (metroRef.current) window.clearInterval(metroRef.current);
    metroRef.current = null;
  }, []);

  const startMetronome = useCallback(() => {
    stopMetronome();
    click(true);
    let beat = 1;
    metroRef.current = window.setInterval(() => {
      click(beat % project.timeSignature[0] === 0);
      beat += 1;
    }, beatSeconds * 1000);
  }, [beatSeconds, click, project.timeSignature, stopMetronome]);

  const clearPlayback = useCallback((reset = false) => {
    playbackEngineRef.current?.stop(reset);
    if (reset) setElapsed(0);
  }, []);

  const cleanupCapture = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (countInTimerRef.current) window.clearInterval(countInTimerRef.current);
    timerRef.current = null;
    countInTimerRef.current = null;
    stopMetronome();
    if (status !== 'playing') clearPlayback();
  }, [clearPlayback, status, stopMetronome]);

  const startRecordingClock = useCallback(() => {
    startAtRef.current = performance.now();
    setElapsed(recordStartRef.current);
    setStatus('recording');
    if (project.metronomeDuringRecording) startMetronome();
    timerRef.current = window.setInterval(() => setElapsed(recordStartRef.current + (performance.now() - startAtRef.current) / 1000), 50);
  }, [project.metronomeDuringRecording, startMetronome]);

  const countIn = useCallback(async () => {
    const total = project.countInBars * project.timeSignature[0];
    if (total <= 0) return;
    setStatus('countin');
    setCountBeat(1);
    click(true);
    let beat = 1;
    await new Promise<void>(resolve => {
      countInTimerRef.current = window.setInterval(() => {
        beat += 1;
        if (beat > total) {
          if (countInTimerRef.current) window.clearInterval(countInTimerRef.current);
          countInTimerRef.current = null;
          resolve();
          return;
        }
        setCountBeat(beat);
        click((beat - 1) % project.timeSignature[0] === 0);
      }, beatSeconds * 1000);
    });
  }, [beatSeconds, click, project.countInBars, project.timeSignature]);

  const playbackBounds = useCallback((mode: VoiceStudioPlaybackMode) => {
    if (mode === 'selection' && selectionRange) return selectionRange;
    if (mode === 'loop' && project.loop.enabled && project.loop.end > project.loop.start) return { start: project.loop.start, end: project.loop.end };
    return { start: contentRange?.start ?? 0, end: contentEnd };
  }, [contentEnd, contentRange, project.loop, selectionRange]);

  const startBackingTracks = useCallback((offset: number) => {
    if (contentEnd <= offset) return;
    void playbackEngine().play({ project, objectUrls: objectUrlsRef.current, offset, end: contentEnd, mode: 'project', loop: false });
  }, [contentEnd, objectUrlsRef, playbackEngine, project]);

  const pause = useCallback(() => {
    playbackEngineRef.current?.pause();
    setStatus('idle');
  }, []);

  const stop = useCallback((reset = false) => {
    playbackEngineRef.current?.stop(reset);
    setStatus('idle');
  }, []);

  const play = useCallback((mode: VoiceStudioPlaybackMode = project.loop.enabled ? 'loop' : 'project') => {
    if (status === 'playing') {
      pause();
      return;
    }
    if (!projectHasContent(project)) return;
    const bounds = playbackBounds(mode);
    if (bounds.end <= bounds.start) return;
    const offset = mode === 'project'
      ? Math.max(bounds.start, elapsed >= bounds.end ? bounds.start : elapsed)
      : bounds.start;
    setStatus('playing');
    void playbackEngine().play({ project, objectUrls: objectUrlsRef.current, offset, end: bounds.end, mode, loop: mode === 'loop' });
  }, [elapsed, objectUrlsRef, pause, playbackBounds, playbackEngine, project, projectHasContent, status]);

  const seek = useCallback((time: number) => {
    const nextPlayhead = Math.max(0, Math.min(duration, quantize(time)));
    if (status === 'playing') stop(false);
    setPlayhead(nextPlayhead);
  }, [duration, quantize, setPlayhead, status, stop]);

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (metroRef.current) window.clearInterval(metroRef.current);
    if (countInTimerRef.current) window.clearInterval(countInTimerRef.current);
    timerRef.current = null;
    metroRef.current = null;
    countInTimerRef.current = null;
    clearPlayback();
  }, [clearPlayback]);

  return { status, elapsed, countBeat, startAtRef, recordStartRef, setStatus, setElapsed, play, pause, stop, clearPlayback, seek, countIn, startRecordingClock, cleanupCapture, startBackingTracks, cleanup };
}
