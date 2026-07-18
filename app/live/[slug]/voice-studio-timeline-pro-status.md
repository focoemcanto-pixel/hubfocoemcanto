# Voice Studio Timeline PRO — Integration Stage

Current branch state:

- Timeline scale and viewport engine implemented.
- Adaptive ruler implemented.
- React viewport controller implemented.
- Pixel-based canvas implemented.
- Main DAW runtime integration pending.

Do not merge this stage before:

- `voice-studio-daw.tsx` consumes `useVoiceStudioTimeline`;
- timeline uses `VoiceStudioTimelineCanvas`;
- scroll and zoom persist through `project.view`;
- drag and trim use pixel-to-time conversion;
- playback auto-scroll is validated;
- Next/OpenNext build is green.
