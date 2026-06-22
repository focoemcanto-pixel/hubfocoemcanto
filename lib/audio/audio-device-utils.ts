export type AudioInputDevice = {
  deviceId: string;
  label: string;
  groupId?: string;
  isLikelyHeadset: boolean;
  isLikelyPhoneMic: boolean;
};

function normalizeLabel(label: string) {
  return label.toLowerCase();
}

export function classifyAudioInput(device: MediaDeviceInfo, index: number): AudioInputDevice {
  const rawLabel = device.label || `Microfone ${index + 1}`;
  const label = rawLabel.trim() || `Microfone ${index + 1}`;
  const lower = normalizeLabel(label);
  const isLikelyHeadset = /bluetooth|airpods|headset|headphone|fone|hands-free|handsfree|earbuds|buds|wh-/.test(lower);
  const isLikelyPhoneMic = /built.?in|internal|iphone|ipad|android|phone|celular|microfone interno|default/.test(lower) && !isLikelyHeadset;

  return {
    deviceId: device.deviceId,
    label,
    groupId: device.groupId || undefined,
    isLikelyHeadset,
    isLikelyPhoneMic,
  };
}

export async function listAudioInputDevices() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map(classifyAudioInput);
}

export function preferredPhoneMicDeviceId(devices: AudioInputDevice[]) {
  return devices.find((device) => device.isLikelyPhoneMic)?.deviceId || devices.find((device) => !device.isLikelyHeadset)?.deviceId || devices[0]?.deviceId || '';
}

export function deviceHint(device?: AudioInputDevice | null) {
  if (!device) return 'Selecione o microfone que vai captar sua voz.';
  if (device.isLikelyHeadset) return 'Microfone de fone detectado. Pode funcionar, mas geralmente comprime mais a voz.';
  if (device.isLikelyPhoneMic) return 'Boa opção: ouça no fone e grave pelo microfone do celular.';
  return 'Teste falando perto do celular para confirmar se este é o microfone ideal.';
}
