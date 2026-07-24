'use client';

import { useEffect, useRef, useState } from 'react';
import { Cloud, Download, FolderUp, HardDrive, Play, Square, X } from 'lucide-react';

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };
type Mode = 'daily' | 'local';

function bestMimeType() {
  return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || '';
}
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function safe(value: string) { return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ') || 'Aula'; }

export default function LiveRecordingCenterRuntime() {
  const [isHost,setIsHost] = useState(false);
  const [open,setOpen] = useState(false);
  const [mode,setMode] = useState<Mode>('daily');
  const [theme,setTheme] = useState('Nova aula');
  const [recording,setRecording] = useState(false);
  const [elapsed,setElapsed] = useState(0);
  const [blob,setBlob] = useState<Blob|null>(null);
  const [status,setStatus] = useState('');
  const [uploading,setUploading] = useState(false);
  const recorderRef = useRef<MediaRecorder|null>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);

  useEffect(()=>{
    setIsHost(new URLSearchParams(location.search).get('host')==='1');
    const title = document.querySelector('.fl-brand-subtitle')?.textContent?.trim();
    if(title) setTheme(title);
    const onOpen=()=>setOpen(true);
    window.addEventListener('foco-recording-center-open',onOpen);
    const click=(event:MouseEvent)=>{
      const target=(event.target as HTMLElement|null)?.closest('.fl-recording-button');
      if(!target)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();setOpen(true);
    };
    document.addEventListener('click',click,true);
    return()=>{window.removeEventListener('foco-recording-center-open',onOpen);document.removeEventListener('click',click,true)};
  },[]);

  useEffect(()=>{ if(!recording)return; const timer=window.setInterval(()=>setElapsed(Date.now()-startedRef.current),500); return()=>window.clearInterval(timer); },[recording]);

  async function startDaily(){
    try{
      const call=(window as LiveWindow).__FOCO_LIVE_CALL__;
      if(!call?.startRecording) throw new Error('A gravação em nuvem não está habilitada nesta sala Daily.');
      await call.startRecording({ layout: { preset: 'active-participant' } });
      startedRef.current=Date.now();setElapsed(0);setRecording(true);setStatus('Gravação na nuvem iniciada.');setOpen(false);
    }catch(error){setStatus(error instanceof Error?error.message:'Não foi possível iniciar a gravação Daily.');}
  }
  async function stopDaily(){
    try{ await (window as LiveWindow).__FOCO_LIVE_CALL__?.stopRecording?.(); setRecording(false); setOpen(true); setStatus('Gravação enviada para processamento na Daily.'); }
    catch{setStatus('Não foi possível encerrar a gravação Daily.');setOpen(true);}
  }
  async function startLocal(){
    try{
      setBlob(null);setStatus('Selecione “Esta guia” e ative o áudio da guia.');
      const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30}},audio:true,preferCurrentTab:true,selfBrowserSurface:'include',systemAudio:'include'} as DisplayMediaStreamOptions);
      const mimeType=bestMimeType();
      const recorder=new MediaRecorder(stream,mimeType?{mimeType,videoBitsPerSecond:4_500_000,audioBitsPerSecond:192_000}:undefined);
      streamRef.current=stream;recorderRef.current=recorder;chunksRef.current=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};
      recorder.onstop=()=>{const result=new Blob(chunksRef.current,{type:recorder.mimeType||'video/webm'});setBlob(result);setRecording(false);setOpen(true);stream.getTracks().forEach(t=>t.stop());setStatus('Gravação pronta para baixar ou salvar no Google Drive.');};
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>recorder.state!=='inactive'&&recorder.stop(),{once:true});
      recorder.start(1000);startedRef.current=Date.now();setElapsed(0);setRecording(true);setStatus('Gravando pelo Foco Live.');setOpen(false);
    }catch(error){setStatus(error instanceof Error&&error.name==='NotAllowedError'?'Captura cancelada.':'Não foi possível iniciar a gravação local.');}
  }
  function stopLocal(){const recorder=recorderRef.current;if(recorder&&recorder.state!=='inactive'){try{recorder.requestData()}catch{}recorder.stop();}}
  function stopRecording(){ if(mode==='daily') void stopDaily(); else stopLocal(); }
  function download(){if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${safe(theme)} — ${stamp()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
  async function uploadDrive(){
    if(!blob)return;setUploading(true);setStatus('Preparando pasta no Google Drive…');
    try{
      const fileName=`${safe(theme)} — ${new Date().toLocaleDateString('pt-BR').replaceAll('/','-')} — ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}).replace(':','h')}.webm`;
      const session=await fetch('/api/live/recordings/drive-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileName,mimeType:blob.type||'video/webm',theme:safe(theme),dateLabel:new Date().toLocaleDateString('pt-BR').replaceAll('/','-')})});
      const data=await session.json();if(!session.ok)throw new Error(data.error||'Falha ao conectar ao Drive');
      setStatus('Enviando gravação ao Google Drive…');
      const upload=await fetch(data.uploadUrl,{method:'PUT',headers:{'content-type':blob.type||'video/webm','content-length':String(blob.size)},body:blob});
      if(!upload.ok)throw new Error('O envio ao Google Drive falhou.');
      setStatus('Gravação salva no Google Drive com tema e data.');setBlob(null);
    }catch(error){setStatus(error instanceof Error?error.message:'Erro ao enviar ao Google Drive.');}finally{setUploading(false)}
  }
  const time=new Date(elapsed).toISOString().slice(11,19);
  if(!isHost)return null;
  return <>
    {recording&&!open&&<button className="fl-recording-floating" onClick={()=>setOpen(true)} title="Abrir central de gravação"><i/><b>GRAVANDO</b><span>{time}</span></button>}
    {open&&<div className="fl-recording-center-backdrop" onPointerDown={()=>setOpen(false)}>
      <section className="fl-recording-center" onPointerDown={e=>e.stopPropagation()}>
        <header><div><small>FOCO LIVE</small><strong>Central de gravação</strong></div><button onClick={()=>setOpen(false)}><X/></button></header>
        <label className="fl-recording-theme">Tema da aula<input value={theme} onChange={e=>setTheme(e.target.value)} maxLength={100} disabled={recording}/></label>
        <div className="fl-recording-modes"><button className={mode==='daily'?'active':''} onClick={()=>!recording&&setMode('daily')}><Cloud/><b>Nuvem Daily</b><small>Processamento nos servidores da Daily</small></button><button className={mode==='local'?'active':''} onClick={()=>!recording&&setMode('local')}><HardDrive/><b>Foco Live + Drive</b><small>Captura da aula e envio ao Google Drive</small></button></div>
        {recording&&<div className="fl-recording-live"><i/> <b>GRAVANDO</b><span>{time}</span></div>}
        {!recording&&!blob&&<button className="fl-recording-primary" onClick={mode==='daily'?startDaily:startLocal}><Play/> Iniciar gravação</button>}
        {recording&&<button className="fl-recording-stop" onClick={stopRecording}><Square/> Encerrar gravação</button>}
        {blob&&<div className="fl-recording-result"><b>Arquivo pronto</b><small>{(blob.size/1024/1024).toFixed(1)} MB</small><div><button onClick={download}><Download/> Baixar</button><button disabled={uploading} className="drive" onClick={uploadDrive}><FolderUp/> {uploading?'Enviando…':'Salvar no Google Drive'}</button></div></div>}
        {status&&<p className="fl-recording-status">{status}</p>}
        <footer>{recording?'Você pode fechar esta janela e continuar a aula. O indicador vermelho continuará visível.':mode==='daily'?'A disponibilidade depende do plano e da configuração da sua conta Daily.':'O vídeo é enviado diretamente do navegador ao seu Google Drive.'}</footer>
      </section>
    </div>}
  </>;
}
