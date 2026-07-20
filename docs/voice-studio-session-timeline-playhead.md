# Voice Studio — Timeline playhead owned by Session

## Goal

Complete the visual playhead migration without replacing the professional Timeline canvas or losing its existing editing contracts.

## Repository reality

There is no separate `VoiceStudioTimelineView` implementation ready for an atomic replacement. The production Timeline component is:

```text
app/live/[slug]/voice-studio-timeline-canvas.tsx
```

It already owns ruler rendering, tracks, clips, waveforms, MIDI notes, fades, trim handles, lasso and live-recording preview.

Creating a second incomplete Timeline would duplicate behavior and introduce regressions. The safe migration is to move the visual clock inside the existing canvas to the Session source.

## New data flow

```text
Playback / Recording / Project load
              |
              v
          EventBus
              |
              v
         PlayheadStore
              |
              v
 useVoiceStudioPlayhead()
              |
              v
 Timeline ruler + cursor
```

## What changed

`VoiceStudioTimelineCanvas` now reads:

```ts
const { playhead: visualPlayhead } = useVoiceStudioPlayhead();
```

The ruler and cursor use `visualPlayhead`, not the legacy `elapsed` state.

A diagnostic marker was added:

```html
data-playhead-source="session"
```

## Legacy elapsed scope

The `elapsed` prop remains temporarily for one purpose only: calculating the width of the live recording preview while the old Recording implementation is still mounted.

It no longer controls:

- the Timeline cursor;
- the ruler playhead;
- playback position visualization.

## Preserved contracts

This PR deliberately preserves:

- seek callbacks;
- clip selection;
- dragging;
- trimming;
- lasso selection;
- waveforms;
- MIDI rendering;
- recording preview.

## Next cleanup

After Recording migrates to Session, remove the remaining `elapsed` prop and derive the live recording preview from Session recording events/state.
