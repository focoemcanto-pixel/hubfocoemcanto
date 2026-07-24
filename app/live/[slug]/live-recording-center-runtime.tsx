'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Cloud, Copy, Download, ExternalLink, Folder, FolderOpen, FolderUp, HardDrive, LogIn, Play, Square, X } from 'lucide-react';

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };
type Mode = 'daily' | 'local';
type DriveFolder = { id: string; name: string; parents?: string[] };
type FolderLevel = { id: string; name: string };
type ReplayLinks = { currentUrl: string; permanentUrl: string };

function bestMimeType() { return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || ''; }
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
  const [driveConnected,setDriveConnected] = useState<boolean|null>(null);
  const [folders,setFolders] = useState<DriveFolder[]>([]);
  const [folderStack,setFolderStack] = useState<FolderLevel[]>([{ id:'root', name:'Meu Drive' }]);
  const [selectedFolder,setSelectedFolder] = useState<FolderLevel>({ id:'root', name:'Meu Drive' });
  const [driveLoading,setDriveLoading] = useState(false);
  const [replayLinks,setReplayLinks] = useState<ReplayLinks|null>(null);
  const recorderRef = useRef<MediaRecorder|null>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);

  const loadDrive = async (parent = folderStack.at(-1)?.id || 'root') => {
    setDriveLoading(true);
    try {
      const response = await fetch(`/api/live/recordings/google-drive?parent=${encodeURIComponent(parent)}`, { cache:'no-store' });
      const data = await response.json();
      setDriveConnected(Boolean(data.connected));
      setFolders(data.folders || []);
      if (data.error) setStatus(data.error);
    } catch { setDriveConnected(false); setFolders([]); }
    finally { setDriveLoading(false); }
  };

  useEffect(()=>{
    setIsHost(new URLSearchParams(location.search).get('host')==='1');
    const title = document.querySelector('.fl-brand-subtitle')?.textContent?.trim();
    if(title) setTheme(title);
    const onOpen=()=>{setOpen(true);void loadDrive('root')};
    window.addEventListener('foco-recording-center-open',onOpen);
    const onGoogle=(event:MessageEvent)=>{
      if(event.origin!==location.origin)return;
      let data:any=event.data;
      if(typeof data==='string'){try{data=JSON.parse(data)}catch{return}}
      if(data?.type!=='foco-google-drive-connected')return;
      setDriveConnected(Boolean(data.success));setStatus(data.message||'Google Drive conectado.');
      if(data.success){setFolderStack([{id:'root',name:'Meu Drive'}]);setSelectedFolder({id:'root',name:'Meu Drive'});void loadDrive('root')}
    };
    window.addEventListener('message',onGoogle);
    const click=(event:MouseEvent)=>{
      const target=(event.target as HTMLElement|null)?.closest('.fl-recording-button');
      if(!target)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();setOpen(true);void loadDrive('root');
    };
    document.addEventListener('click',click,true);
    return()=>{window.removeEventListener('foco-recording-center-open',onOpen);window.removeEventListener('message',onGoogle);document.removeEventListener('click',click,true)};
  },[]);

  useEffect(()=>{ if(!recording)return; const timer=window.setInterval(()=>setElapsed(Date.now()-startedRef.current),500); return()=>window.clearInterval(timer); },[recording]);

  async function startDaily(){try{const call=(window as LiveWindow).__FOCO_LIVE_CALL__;if(!call?.startRecording)throw new Error('A gravação em nuvem não está habilitada nesta sala Daily.');await call.startRecording({layout:{preset:'active-participant'}});startedRef.current=Date.now();setElapsed(0);setRecording(true);setOpen(false);setStatus('Gravação na nuvem iniciada.')}catch(error){setStatus(error instanceof Error?error.message:'Não foi possível iniciar a gravação Daily.')}}
  async function stopDaily(){try{await(window as LiveWindow).__FOCO_LIVE_CALL__?.stopRecording?.();setRecording(false);setOpen(true);setStatus('Gravação enviada para processamento na Daily.')}catch{setStatus('Não foi possível encerrar a gravação Daily.')}}
  async function startLocal(){try{setBlob(null);setReplayLinks(null);setStatus('Selecione “Esta guia” e ative o áudio da guia.');const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30}},audio:true,preferCurrentTab:true,selfBrowserSurface:'include',systemAudio:'include'} as DisplayMediaStreamOptions);const mimeType=bestMimeType();const recorder=new MediaRecorder(stream,mimeType?{mimeType,videoBitsPerSecond:4_500_000,audioBitsPerSecond:192_000}:undefined);streamRef.current=stream;recorderRef.current=recorder;chunksRef.current=[];recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};recorder.onstop=()=>{const result=new Blob(chunksRef.current,{type:recorder.mimeType||'video/webm'});setBlob(result);setRecording(false);setOpen(true);stream.getTracks().forEach(t=>t.stop());setStatus('Gravação pronta para baixar ou publicar como replay.')};stream.getVideoTracks()[0]?.addEventListener('ended',()=>recorder.state!=='inactive'&&recorder.stop(),{once:true});recorder.start(1000);startedRef.current=Date.now();setElapsed(0);setRecording(true);setOpen(false);setStatus('Gravando pelo Foco Live.')}catch(error){setStatus(error instanceof Error&&error.name==='NotAllowedError'?'Captura cancelada.':'Não foi possível iniciar a gravação local.')}}
  function stopLocal(){const recorder=recorderRef.current;if(recorder&&recorder.state!=='inactive'){try{recorder.requestData()}catch{}recorder.stop()}}
  function download(){if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${safe(theme)} — ${stamp()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
  function connectGoogle(){window.open('/api/live/recordings/google-connect','foco-google-drive','popup=yes,width=520,height=720,left=160,top=80')}
  async function enterFolder(folder:DriveFolder){const next=[...folderStack,{id:folder.id,name:folder.name}];setFolderStack(next);setSelectedFolder({id:folder.id,name:folder.name});await loadDrive(folder.id)}
  async function goBack(){if(folderStack.length<=1)return;const next=folderStack.slice(0,-1);setFolderStack(next);const current=next.at(-1)!;setSelectedFolder(current);await loadDrive(current.id)}
  function chooseCurrent(){const current=folderStack.at(-1)!;setSelectedFolder(current);setStatus(`Pasta selecionada: ${current.name}`)}
  async function copyLink(path:string){await navigator.clipboard.writeText(`${location.origin}${path}`);setStatus('Link do replay copiado.')}
  async function uploadDrive(){
    if(!blob)return;
    if(!driveConnected){setStatus('Conecte o Google Drive antes de salvar.');return}
    setUploading(true);setStatus('Preparando pasta no Google Drive…');
    try{
      const dateLabel=new Date().toLocaleDateString('pt-BR').replaceAll('/','-');
      const fileName=`${safe(theme)} — ${dateLabel} — ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}).replace(':','h')}.webm`;
      const session=await fetch('/api/live/recordings/drive-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileName,mimeType:blob.type||'video/webm',theme:safe(theme),dateLabel,destinationFolderId:selectedFolder.id})});
      const data=await session.json();if(!session.ok)throw new Error(data.error||'Falha ao conectar ao Drive');
      setStatus('Enviando gravação ao Google Drive…');
      const upload=await fetch(data.uploadUrl,{method:'PUT',headers:{'content-type':blob.type||'video/webm','content-length':String(blob.size)},body:blob});
      if(!upload.ok)throw new Error('O envio ao Google Drive falhou.');
      const uploaded=await upload.json().catch(()=>({}));
      const driveFileId=uploaded.id;
      if(!driveFileId)throw new Error('O Drive recebeu o vídeo, mas não retornou o identificador do arquivo.');
      setStatus('Publicando página personalizada de replay…');
      const publish=await fetch('/api/live/recordings/publish-replay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:safe(theme),driveFileId,driveFolderId:data.folderId,fileName,mimeType:blob.type||'video/webm'})});
      const published=await publish.json();if(!publish.ok)throw new Error(published.error||'O vídeo foi salvo, mas o replay não pôde ser publicado.');
      setReplayLinks({currentUrl:published.currentUrl,permanentUrl:published.permanentUrl});
      setStatus('Replay publicado! O link semanal já aponta para esta aula.');setBlob(null);
    }catch(error){setStatus(error instanceof Error?error.message:'Erro ao enviar ao Google Drive.')}finally{setUploading(false)}
  }

  const time=new Date(elapsed).toISOString().slice(11,19);
  if(!isHost)return null;
  return <>
    {recording&&!open&&<button className="fl-recording-mini" onClick={()=>setOpen(true)}><i/><b>GRAVANDO</b><span>{time}</span></button>}
    {open&&<div className="fl-recording-center-backdrop" onPointerDown={()=>setOpen(false)}><section className="fl-recording-center" onPointerDown={e=>e.stopPropagation()}>
      <header><div><small>FOCO LIVE</small><strong>Central de gravação</strong></div><button onClick={()=>setOpen(false)}><X/></button></header>
      <label className="fl-recording-theme">Tema da aula<input value={theme} onChange={e=>setTheme(e.target.value)} maxLength={100}/></label>
      <div className="fl-recording-modes"><button className={mode==='daily'?'active':''} onClick={()=>!recording&&setMode('daily')}><Cloud/><b>Nuvem Daily</b><small>Processamento nos servidores da Daily</small></button><button className={mode==='local'?'active':''} onClick={()=>!recording&&setMode('local')}><HardDrive/><b>Foco Live + Drive</b><small>Captura, armazenamento e página de replay</small></button></div>
      {mode==='local'&&<section className="fl-drive-setup">
        {driveConnected===false&&<div className="fl-drive-connect"><div><LogIn/><span><b>Conecte seu Google Drive</b><small>O login abre em uma janela segura do Google e retorna automaticamente para esta tela.</small></span></div><button onClick={connectGoogle}>Entrar com Google</button></div>}
        {driveConnected&&<div className="fl-drive-picker"><header><div><FolderOpen/><span><b>Pasta de salvamento</b><small>{selectedFolder.name}</small></span></div><button onClick={()=>loadDrive(folderStack.at(-1)?.id)}>Atualizar</button></header><div className="fl-drive-breadcrumb"><button disabled={folderStack.length<=1} onClick={goBack}><ArrowLeft/></button><span>{folderStack.map(item=>item.name).join(' / ')}</span></div><div className="fl-drive-folders">{driveLoading?<small>Carregando pastas…</small>:folders.length?folders.map(folder=><button key={folder.id} onClick={()=>enterFolder(folder)}><Folder/><span>{folder.name}</span><i>›</i></button>):<small>Nenhuma subpasta aqui.</small>}</div><button className="fl-drive-choose" onClick={chooseCurrent}><Check/> Usar esta pasta</button></div>}
      </section>}
      {recording&&<div className="fl-recording-live"><i/><b>GRAVANDO</b><span>{time}</span></div>}
      {!recording&&!blob&&!replayLinks&&<button className="fl-recording-primary" onClick={mode==='daily'?startDaily:startLocal}><Play/> Iniciar gravação</button>}
      {recording&&<button className="fl-recording-stop" onClick={mode==='daily'?stopDaily:stopLocal}><Square/> Encerrar gravação</button>}
      {blob&&<div className="fl-recording-result"><b>Arquivo pronto</b><small>{(blob.size/1024/1024).toFixed(1)} MB</small><div><button onClick={download}><Download/> Baixar original</button><button disabled={uploading||!driveConnected} className="drive" onClick={uploadDrive}><FolderUp/> {uploading?'Publicando…':'Salvar e publicar replay'}</button></div></div>}
      {replayLinks&&<div className="fl-replay-published"><b>Replay publicado</b><p>O link semanal foi atualizado automaticamente.</p><div><button onClick={()=>copyLink(replayLinks.currentUrl)}><Copy/> Copiar link semanal</button><a href={replayLinks.permanentUrl} target="_blank" rel="noreferrer"><ExternalLink/> Abrir replay</a></div><small>{location.origin}{replayLinks.permanentUrl}</small></div>}
      {status&&<p className="fl-recording-status">{status}</p>}
      <footer>{mode==='daily'?'A disponibilidade depende do plano e da configuração da sua conta Daily.':'Ao salvar, o vídeo entra no Drive e o endereço /replay passa a mostrar esta aula.'}</footer>
    </section></div>}
  </>;
}
