import { describe, expect, it } from 'vitest';
import { createVoiceStudioEventBus } from './voice-studio-event-bus';
import { createVoiceStudioTransportController } from './voice-studio-transport-controller';

describe('TransportController state contract', () => {
  it('keeps the legacy snapshot contract stable while the state machine is introduced separately', () => {
    const transport = createVoiceStudioTransportController({ eventBus: createVoiceStudioEventBus() });
    expect(transport.getSnapshot()).toMatchObject({ status: 'idle', playhead: 0 });
  });
});
