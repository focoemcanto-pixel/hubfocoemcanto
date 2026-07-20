# Voice Studio Recording Capture Lifecycle

## Objective

Move ownership of browser capture resources into the `VoiceStudioSession` before replacing the final legacy recording adapter.

The new lifecycle does not decide how audio or MIDI data becomes assets. It owns only the resource boundary around capture.

## Session API

```ts
session.recordingCapture
```

States:

```text
idle → preparing → capturing → stopping → idle
                     ↓
                   failed
```

## Capture handle

A capture adapter supplies:

```ts
{
  stop(): Promise<void> | void;
  cancel(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}
```

This supports audio and MIDI without coupling the lifecycle to `MediaRecorder`, Web MIDI, React, project mutation, or rendering.

## Guarantees

- only one active capture;
- late handles are disposed after cancellation;
- stop always disposes resources;
- cancel is safe during preparation and active capture;
- preparation failures become observable state;
- Session owns the lifecycle instance.

## Current boundary

The legacy controller still creates the concrete browser capture adapters. The next PR will wire those adapters to `session.recordingCapture.start(...)` and remove the temporary hidden-button click bridge.

## Required validation

The following commands were not executed inside ChatGPT and remain required:

```bash
npm install
npm run test:run
npm run test:coverage
npm run lint
npm run build
npx opennextjs-cloudflare build
```
