'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AudioLines, Check, ChevronUp, KeyboardMusic, Mic2, PenTool, Settings2, SlidersHorizontal, Video } from 'lucide-react';

type Panel = 'apps' | 'mic' | 'camera' | null;
type DeviceSummary = { microphones: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] };
type DeviceKind = 'audio' | 'video';

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };

export default function LiveToolsRuntime() {
  const [roomReady, setRoomReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [devices, setDevices] = useState<DeviceSummary>({ microphones: [], cameras: [] });
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [switchingDevice, setSwitchingDevice] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [audioProfile, setAudioProfile] = useState<'speech' | 'music'>(() => 'speech');
  const [meter, setMeter] = useState(0);
  const [offersPanel, setOffersPanel] = useState<HTMLElement | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const controls = roomReady ? document.querySelector('.fl-controls') : null;
  const micButton = roomReady ? document.querySelector('.fl-controls > button:nth-child(1)') : null;
  const cameraButton = roomReady ? document.querySelector('.fl-controls > button:nth-child(2)') : null;

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    setAudioProfile(window.localStorage.getItem('foco-live-audio-mode') === 'music' ? 'music' : 'speech');
    setSelectedMic(window.localStorage.getItem('foco-live-microphone-id') || '');
    setSelectedCamera(window.localStorage.getItem('foco-live-camera-id') || '');
    const sync = () => {
      setRoomReady(Boolean(document.querySelector('.fl-room')));
      setOffersPanel(document.querySelector<HTMLElement>('.fl-director-offers'));
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!roomReady || !navigator.mediaDevices?.enumerateDevices) return;
    const load = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const microphones = list.filter((device) => device.kind === 'audioinput');
        const cameras = list.filter((device) => device.kind === 'videoinput');
        setDevices({ microphones, cameras });
        if (!selectedMic && microphones[0]) setSelectedMic(microphones[0].deviceId);
        if (!selectedCamera && cameras[0]) setSelectedCamera(cameras[0].deviceId);
      } catch { setDevices({ microphones: [], cameras: [] }); }
    };
    void load();
    navigator.mediaDevices.addEventListener?.('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', load);
  }, [roomReady, selectedCamera, selectedMic]);

  useEffect(() => {
    if (panel !== 'mic' || !selectedMic) { meterCleanupRef.current?.(); meterCleanupRef.current = null; setMeter(0); return; }
    let cancelled = false;
    void navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedMic } } }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256; source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0;
      const draw = () => { analyser.getByteFrequencyData(data); setMeter(Math.min(100, (data.reduce((sum, value) => sum + value, 0) / data.length) * 1.6)); frame = requestAnimationFrame(draw); };
      draw();
      meterCleanupRef.current = () => { cancelAnimationFrame(frame); stream.getTracks().forEach((track) => track.stop()); void context.close(); };
    }).catch(() => undefined);
    return () => { cancelled = true; meterCleanupRef.current?.(); meterCleanupRef.current = null; };
  }, [panel, selectedMic]);

  useEffect(() => {
    if (!panel) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.fl-tools-popover') && !target.closest('.fl-control-chevron') && !target.closest('.fl-apps-trigger')) setPanel(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [panel]);

  const title = useMemo(() => panel === 'apps' ? 'Apps' : panel === 'mic' ? 'Microfone' : 'Câmera', [panel]);

  async function setProfile(profile: 'speech' | 'music') {
    setAudioProfile(profile); window.localStorage.setItem('foco-live-audio-mode', profile);
    const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
    try {
      const settings = { audio: { processor: { type: profile === 'music' ? 'none' : 'noise-cancellation' } } };
      if (typeof call?.updateInputSettings === 'function') await call.updateInputSettings(settings);
      else if (typeof call?.setInputSettingsAsync === 'function') await call.setInputSettingsAsync(settings);
    } catch {}
  }

  async function selectDevice(kind: DeviceKind, deviceId: string) {
    const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
    setSwitchingDevice(deviceId); setDeviceError('');
    try {
      if (!call) throw new Error('A chamada ainda não está pronta.');
      const currentMic = kind === 'audio' ? deviceId : selectedMic || undefined;
      const currentCamera = kind === 'video' ? deviceId : selectedCamera || undefined;
      if (typeof call.setInputDevicesAsync === 'function') {
        await call.setInputDevicesAsync({ audioDeviceId: currentMic, videoDeviceId: currentCamera });
      } else if (typeof call.setInputDevices === 'function') {
        await call.setInputDevices({ audioDeviceId: currentMic, videoDeviceId: currentCamera });
      } else {
        throw new Error('A troca de dispositivo não é suportada nesta sessão.');
      }
      if (kind === 'audio') { setSelectedMic(deviceId); window.localStorage.setItem('foco-live-microphone-id', deviceId); }
      else { setSelectedCamera(deviceId); window.localStorage.setItem('foco-live-camera-id', deviceId); }
    } catch (reason) {
      setDeviceError(reason instanceof Error ? reason.message : 'Não foi possível trocar o dispositivo.');
    } finally { setSwitchingDevice(''); }
  }

  function openApp(eventName: string) { window.dispatchEvent(new Event(eventName)); setPanel(null); }
  const currentMic = devices.microphones.find((device) => device.deviceId === selectedMic) || devices.microphones[0];
  const currentCamera = devices.cameras.find((device) => device.deviceId === selectedCamera) || devices.cameras[0];

  if (!roomReady) return null;

  return <>
    {micButton && createPortal(<span className="fl-control-chevron" role="button" tabIndex={0} aria-label="Ajustes do microfone" onClick={(event) => { event.stopPropagation(); setPanel(panel === 'mic' ? null : 'mic'); }}><ChevronUp size={12} /></span>, micButton)}
    {cameraButton && createPortal(<span className="fl-control-chevron" role="button" tabIndex={0} aria-label="Ajustes da câmera" onClick={(event) => { event.stopPropagation(); setPanel(panel === 'camera' ? null : 'camera'); }}><ChevronUp size={12} /></span>, cameraButton)}
    {controls && createPortal(<button type="button" className={`fl-apps-trigger${panel === 'apps' ? ' active' : ''}`} onClick={() => setPanel(panel === 'apps' ? null : 'apps')}><SlidersHorizontal /><span>Apps</span></button>, controls)}

    {panel && <section className={`fl-tools-popover panel-${panel}`}>
      <header><div><small>FOCO LIVE</small><strong>{title}</strong></div><button onClick={() => setPanel(null)}>×</button></header>
      {panel === 'apps' && <div className="fl-tools-list">
        {isHost && <><button onClick={() => openApp('foco-piano-toggle')}><KeyboardMusic /><div><b>Foco Keys</b><small>Piano sincronizado da aula</small></div><i>›</i></button><button onClick={() => openApp('foco-board-toggle')}><PenTool /><div><b>Foco Board</b><small>Quadro visual com desenho e texto rico</small></div><i>›</i></button><button onClick={() => openApp('foco-voice-studio-toggle')}><AudioLines /><div><b>Voice Studio</b><small>Gravação vocal em múltiplas faixas</small></div><i>›</i></button></>}
        {!isHost && <div className="fl-tools-info"><KeyboardMusic /><div><b>Apps da aula</b><small>As ferramentas aparecem automaticamente quando o professor exibir.</small></div></div>}
        <button disabled><Settings2 /><div><b>Afinador</b><small>Em breve</small></div></button><button disabled><SlidersHorizontal /><div><b>Timer</b><small>Em breve</small></div></button>
      </div>}
      {panel === 'mic' && <div className="fl-tools-list fl-device-selector-list">
        <div className="fl-device-card"><Mic2 /><div><small>DISPOSITIVO ATUAL</small><b>{currentMic?.label || 'Microfone padrão do navegador'}</b></div></div>
        <div className="fl-audio-meter"><span style={{ width: `${meter}%` }} /></div>
        <small className="fl-device-section-label">ESCOLHER MICROFONE</small>
        {devices.microphones.map((device, index) => <button key={device.deviceId || index} className={selectedMic === device.deviceId ? 'selected device-option' : 'device-option'} disabled={switchingDevice === device.deviceId} onClick={() => selectDevice('audio', device.deviceId)}><Mic2 /><div><b>{device.label || `Microfone ${index + 1}`}</b><small>{selectedMic === device.deviceId ? 'Em uso agora' : 'Clique para usar'}</small></div>{selectedMic === device.deviceId && <Check size={17} />}</button>)}
        <small className="fl-device-section-label">PROCESSAMENTO</small>
        <button className={audioProfile === 'speech' ? 'selected' : ''} onClick={() => setProfile('speech')}><Mic2 /><div><b>Perfil voz</b><small>Cancelamento de ruído ativo</small></div></button>
        <button className={audioProfile === 'music' ? 'selected' : ''} onClick={() => setProfile('music')}><SlidersHorizontal /><div><b>Perfil música</b><small>Preserva dinâmica e harmônicos</small></div></button>
        {deviceError && <p className="fl-device-error">{deviceError}</p>}
      </div>}
      {panel === 'camera' && <div className="fl-tools-list fl-device-selector-list">
        <div className="fl-device-card"><Video /><div><small>DISPOSITIVO ATUAL</small><b>{currentCamera?.label || 'Câmera padrão do navegador'}</b></div></div>
        <small className="fl-device-section-label">ESCOLHER CÂMERA</small>
        {devices.cameras.map((device, index) => <button key={device.deviceId || index} className={selectedCamera === device.deviceId ? 'selected device-option' : 'device-option'} disabled={switchingDevice === device.deviceId} onClick={() => selectDevice('video', device.deviceId)}><Video /><div><b>{device.label || `Câmera ${index + 1}`}</b><small>{selectedCamera === device.deviceId ? 'Em uso agora' : 'Clique para usar'}</small></div>{selectedCamera === device.deviceId && <Check size={17} />}</button>)}
        {!devices.cameras.length && <p className="fl-tools-hint">Nenhuma câmera disponível. Verifique as permissões do navegador.</p>}
        {deviceError && <p className="fl-device-error">{deviceError}</p>}
      </div>}
    </section>}
    {offersPanel && createPortal(<OfferAccordion panel={offersPanel} />, offersPanel, 'foco-offers-accordion')}
  </>;
}

function OfferAccordion({ panel }: { panel: HTMLElement }) {
  const [expanded, setExpanded] = useState(() => panel.classList.contains('fl-offers-expanded'));
  useEffect(() => {
    panel.classList.toggle('fl-offers-expanded', expanded);
    return () => panel.classList.remove('fl-offers-expanded');
  }, [expanded, panel]);
  return <button type="button" className="fl-offers-toggle" onClick={() => setExpanded((current) => !current)}><span>Ofertas</span><small>{expanded ? 'Recolher opções' : 'Abrir biblioteca e CTAs'}</small><ChevronUp className={expanded ? '' : 'collapsed'} size={16} /></button>;
}
