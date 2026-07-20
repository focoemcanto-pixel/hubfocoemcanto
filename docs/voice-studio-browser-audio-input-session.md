# Voice Studio Browser Audio Input Session

This module composes the browser recording adapter with the Web Audio input graph used by the Voice Studio.

It owns:

- MediaStream source creation;
- analyser lifecycle;
- monitor gain routing;
- continuous meter/peak frames;
- graph cleanup on stop, cancel and dispose.

It does not own asset creation, waveform decoding, clip commit or MIDI capture. Those remain separate migration steps.
