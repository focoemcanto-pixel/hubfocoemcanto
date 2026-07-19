'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import VoiceStudioDaw from './voice-studio-daw';
import { addAssetClipToProject, type VoiceStudioAsset, type VoiceStudioProject } from './voice-studio-project-model';
import VoiceStudioProjectManager from './voice-studio-project-manager';

const SNAPSHOT_EVENT='foco-voice-studio-snapshot';
const REQUEST_EVENT='foco-voice-studio-request-snapshot';
const LOAD_EVENT='foco-voice-studio-load-project';
const MAX_UPLOAD_BYTES=100*1024*1024;
const AUDIO_EXTENSIONS=/\.(mp3|wav|m4a|aac|ogg|oga|webm|flac)$/i;

const RUNTIME_CSS = `
.vs-daw-runtime{height:100%;min-height:0;position:relative}
.vs-daw-runtime .vs-daw{height:100%;min-height:0;display:flex;flex-direction:column}
.vs-daw-runtime .vs-transport{position:sticky!important;top:0;z-index:90;order:0;flex:0 0 auto;background:#11141b;box-shadow:0 1px 0 #2c313d,0 8px 20px rgba(0,0,0,.22)}
.vs-daw-runtime .vs-options{order:1;flex:0 0 auto}
.vs-daw-runtime .vs-editor{order:2;min-height:0;flex:1 1 auto}
.vs-window-action{height:38px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(255,255,255,.08);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;margin-left:8px;font-weight:800}
.vs-window-action:hover{background:rgba(255,255,255,.14)}
.vs-window-action:disabled{opacity:.5;cursor:wait}
.vs-window-import{padding:0 13px;gap:7px;font-size:12px;white-space:nowrap}
.vs-window-minimize{width:38px;font-size:24px;line-height:1}
.fl-studio-scene.app-voice.vs-minimized{display:none!important}
.vs-restore-studio{position:fixed;right:20px;bottom:20px;z-index:10001;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:#171a22;color:#fff;padding:13px 17px;font-weight:800;box-shadow:0 16px 40px rgba(0,0,0,.42);cursor:pointer;pointer-events:auto}
.vs-restore-studio:hover{background:#232735}
.vs-emergency-stop{position:fixed;right:28px;top:238px;z-index:10000;border:1px solid rgba(255,255,255,.22);border-radius:10px;background:#dc2626;color:#fff;font-weight:800;padding:11px 18px;box-shadow:0 10px 30px rgba(0,0,0,.38);cursor:pointer}
.vs-emergency-stop:hover{background:#ef4444}
.vs-upload-status{position:fixed;right:20px;bottom:78px;z-index:10002;max-width:min(360px,calc(100vw - 32px));border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#171a22;color:#fff;padding:11px 14px;font-size:12px;font-weight:700;box-shadow:0 14px 36px rgba(0,0,0,.4)}
.vs-upload-status.error{border-color:rgba(248,113,113,.55);color:#fecaca}
.vs-drop-overlay{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;background:rgba(6,8,14,.82);backdrop-filter:blur(7px);pointer-events:none}
.vs-drop-card{width:min(520px,calc(100vw - 32px));border:2px dashed rgba(167,139,250,.85);border-radius:24px;background:linear-gradient(145deg,rgba(34,39,55,.98),rgba(20,23,34,.98));padding:36px;text-align:center;color:#fff;box-shadow:0 30px 90px rgba(0,0,0,.55)}
.vs-drop-card strong{display:block;font-size:22px;margin-bottom:8px}.vs-drop-card span{display:block;color:#c4b5fd;font-size:13px;line-height:1.5}
@media(max-width:900px){.vs-emergency-stop{right:14px;top:190px}.vs-restore-studio{right:12px;bottom:12px}.vs-window-import{padding:0 10px}.vs-window-import span{display:none}.vs-upload-status{right:12px;bottom:66px}.vs-drop-card{padding:28px 20px}}
`;

type RoomSnapshot = {
  sceneOpen: boolean;
  broadcasting: boolean;
  layout: string | null;
  cameraShape: string | null;
  cameraCorner: string | null;
};

type StudioSnapshot = {
  project: VoiceStudioProject;
  blobs?: Record<string,Blob>;
};

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}

function findTransportButtons() {
  const root = document.querySelector('.vs-daw-runtime');
  const buttons = Array.from(root?.querySelectorAll('button') || []) as HTMLButtonElement[];
  const byText = (pattern: RegExp) => buttons.find(button => pattern.test(`${button.getAttribute('aria-label') || ''} ${button.title || ''} ${button.textContent || ''}`));
  const controls = root?.querySelector('.vs-main-controls');
  return {
    play: (controls?.querySelector('button:first-of-type') as HTMLButtonElement | null) || byText(/play|reproduzir|pausar|pause/i) || null,
    record: (controls?.querySelector('button:nth-of-type(2)') as HTMLButtonElement | null) || byText(/gravar|record/i) || null,
    stop: byText(/parar|stop/i) || null,
  };
}

function findProjectButtons() {
  const root = document.querySelector('.vs-manager-shell');
  const buttons = Array.from(root?.querySelectorAll('button') || []) as HTMLButtonElement[];
  const byText = (pattern: RegExp) => buttons.find(button => pattern.test(`${button.getAttribute('aria-label') || ''} ${button.title || ''} ${button.textContent || ''}`));
  return {
    save: (root?.querySelector('.vs-save-primary') as HTMLButtonElement | null) || byText(/^\s*salvar\s*$/i) || null,
    saveAs: byText(/salvar\s+como/i) || null,
  };
}

function fileLabel(file:File){
  return file.name.replace(/\.[^.]+$/,'').trim() || 'Áudio importado';
}

function validAudio(file:File){
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);
}

function makePeaks(data:Float32Array,count=180){
  const step=Math.max(1,Math.floor(data.length/count));
  return Array.from({length:count},(_,index)=>{
    let max=0;
    for(let cursor=index*step;cursor<Math.min(data.length,(index+1)*step);cursor+=1)max=Math.max(max,Math.abs(data[cursor]));
    return Math.max(.03,max);
  });
}

async function decodeAudio(file:File){
  const context=new AudioContext();
  try{
    const buffer=await context.decodeAudioData(await file.arrayBuffer());
    return {duration:Math.max(.08,buffer.duration),peaks:makePeaks(buffer.getChannelData(0))};
  }finally{
    await context.close().catch(()=>undefined);
  }
}

function requestStudioSnapshot(timeoutMs=2500){
  return new Promise<StudioSnapshot>((resolve,reject)=>{
    const timeout=window.setTimeout(()=>{
      window.removeEventListener(SNAPSHOT_EVENT,onSnapshot as EventListener);
      reject(new Error('O projeto não respondeu. Tente novamente.'));
    },timeoutMs);
    const onSnapshot=(event:Event)=>{
      const detail=(event as CustomEvent<StudioSnapshot>).detail;
      if(!detail?.project)return;
      window.clearTimeout(timeout);
      window.removeEventListener(SNAPSHOT_EVENT,onSnapshot as EventListener);
      resolve(detail);
    };
    window.addEventListener(SNAPSHOT_EVENT,onSnapshot as EventListener);
    window.dispatchEvent(new Event(REQUEST_EVENT));
  });
}

export default function VoiceStudioDawRuntime(){
  const [target,setTarget]=useState<Element|null>(null);
  const [toolbar,setToolbar]=useState<Element|null>(null);
  const [isHost,setIsHost]=useState(false);
  const [recording,setRecording]=useState(false);
  const [minimized,setMinimized]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploadMessage,setUploadMessage]=useState('');
  const [uploadError,setUploadError]=useState(false);
  const [draggingFiles,setDraggingFiles]=useState(false);
  const roomSnapshotRef=useRef<RoomSnapshot|null>(null);
  const fileInputRef=useRef<HTMLInputElement|null>(null);
  const messageTimerRef=useRef<number|null>(null);
  const dragDepthRef=useRef(0);

  function showUploadMessage(message:string,error=false){
    setUploadMessage(message);
    setUploadError(error);
    if(messageTimerRef.current)window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current=window.setTimeout(()=>setUploadMessage(''),error?6500:4000);
  }

  async function importAudioFiles(input:FileList|File[]){
    if(uploading||recording)return;
    const files=Array.from(input);
    const rejected=files.filter(file=>!validAudio(file)||file.size>MAX_UPLOAD_BYTES);
    const accepted=files.filter(file=>validAudio(file)&&file.size<=MAX_UPLOAD_BYTES);
    if(!accepted.length){
      showUploadMessage(rejected.some(file=>file.size>MAX_UPLOAD_BYTES)?'Os arquivos precisam ter no máximo 100 MB cada.':'Escolha arquivos MP3, WAV, M4A, AAC, OGG, WebM ou FLAC.',true);
      return;
    }
    setUploading(true);
    showUploadMessage(`Preparando ${accepted.length===1?accepted[0].name:`${accepted.length} faixas`}…`);
    try{
      const snapshot=await requestStudioSnapshot();
      const decoded=await Promise.all(accepted.map(async file=>({file,...await decodeAudio(file)})));
      let project=structuredClone(snapshot.project);
      const blobs={...(snapshot.blobs||{})};
      const start=Math.max(0,Number(project.view?.playhead)||0);
      decoded.forEach(({file,duration,peaks},index)=>{
        const assetId=crypto.randomUUID();
        const name=fileLabel(file);
        const asset:VoiceStudioAsset={id:assetId,kind:'audio',duration,peaks,midiNotes:[],mimeType:file.type||'audio/mpeg',fileName:file.name,createdAt:new Date().toISOString()};
        project=addAssetClipToProject(project,asset,name,start);
        blobs[assetId]=file;
        if(index===decoded.length-1)project.updatedAt=new Date().toISOString();
      });
      window.dispatchEvent(new CustomEvent(LOAD_EVENT,{detail:{project,blobs}}));
      const extra=rejected.length?` ${rejected.length} arquivo(s) ignorado(s).`:'';
      showUploadMessage(`${accepted.length} faixa${accepted.length>1?'s':''} adicionada${accepted.length>1?'s':''} na posição ${start.toFixed(1)}s.${extra}`,Boolean(rejected.length));
    }catch(reason){
      showUploadMessage(reason instanceof Error?reason.message:'Não foi possível importar o áudio.',true);
    }finally{
      setUploading(false);
      if(fileInputRef.current)fileInputRef.current.value='';
    }
  }

  useEffect(()=>{
    setIsHost(new URLSearchParams(window.location.search).get('host')==='1');
    const sync=()=>{
      const scene=document.querySelector('.fl-studio-scene.app-voice');
      setTarget(scene?.querySelector('.fl-studio-app-canvas') || null);
      setToolbar(scene?.querySelector('.fl-scene-toolbar') || null);
    };
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    sync();
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>()=>{
    if(messageTimerRef.current)window.clearTimeout(messageTimerRef.current);
  },[]);

  useEffect(()=>{
    if(!isHost)return;
    const hasFiles=(event:DragEvent)=>Array.from(event.dataTransfer?.types||[]).includes('Files');
    const enter=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();dragDepthRef.current+=1;setDraggingFiles(true);};
    const over=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';};
    const leave=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();dragDepthRef.current=Math.max(0,dragDepthRef.current-1);if(!dragDepthRef.current)setDraggingFiles(false);};
    const drop=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();dragDepthRef.current=0;setDraggingFiles(false);if(event.dataTransfer?.files.length)void importAudioFiles(event.dataTransfer.files);};
    window.addEventListener('dragenter',enter);
    window.addEventListener('dragover',over);
    window.addEventListener('dragleave',leave);
    window.addEventListener('drop',drop);
    return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};
  },[isHost,uploading,recording]);

  useEffect(()=>{
    const scene=document.querySelector('.fl-studio-scene.app-voice');
    const room=document.querySelector('.fl-room');
    if(!scene || !room)return;

    if(minimized){
      roomSnapshotRef.current={
        sceneOpen:room.classList.contains('foco-studio-scene-open'),
        broadcasting:room.classList.contains('foco-studio-broadcasting'),
        layout:room.getAttribute('data-studio-layout'),
        cameraShape:room.getAttribute('data-camera-shape'),
        cameraCorner:room.getAttribute('data-camera-corner'),
      };
      scene.classList.add('vs-minimized');
      room.classList.remove('foco-studio-scene-open','foco-studio-broadcasting');
      room.removeAttribute('data-studio-layout');
      room.removeAttribute('data-camera-shape');
      room.removeAttribute('data-camera-corner');
    }else{
      scene.classList.remove('vs-minimized');
      const snapshot=roomSnapshotRef.current;
      if(snapshot){
        room.classList.toggle('foco-studio-scene-open',snapshot.sceneOpen);
        room.classList.toggle('foco-studio-broadcasting',snapshot.broadcasting);
        if(snapshot.layout)room.setAttribute('data-studio-layout',snapshot.layout);
        if(snapshot.cameraShape)room.setAttribute('data-camera-shape',snapshot.cameraShape);
        if(snapshot.cameraCorner)room.setAttribute('data-camera-corner',snapshot.cameraCorner);
        roomSnapshotRef.current=null;
      }
    }

    return()=>{
      scene.classList.remove('vs-minimized');
      const snapshot=roomSnapshotRef.current;
      if(snapshot){
        room.classList.toggle('foco-studio-scene-open',snapshot.sceneOpen);
        room.classList.toggle('foco-studio-broadcasting',snapshot.broadcasting);
        if(snapshot.layout)room.setAttribute('data-studio-layout',snapshot.layout);
        if(snapshot.cameraShape)room.setAttribute('data-camera-shape',snapshot.cameraShape);
        if(snapshot.cameraCorner)room.setAttribute('data-camera-corner',snapshot.cameraCorner);
        roomSnapshotRef.current=null;
      }
    };
  },[minimized,target]);

  useEffect(()=>{
    if(!target)return;
    const syncRecording=()=>{
      const {record}=findTransportButtons();
      const label=`${record?.className || ''} ${record?.getAttribute('aria-pressed') || ''} ${record?.textContent || ''}`;
      setRecording(/recording|gravando|true/i.test(label));
    };
    const observer=new MutationObserver(syncRecording);
    observer.observe(target,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-pressed']});
    syncRecording();
    return()=>observer.disconnect();
  },[target]);

  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(isEditableTarget(event.target)||event.altKey)return;
      const mod=event.ctrlKey||event.metaKey;
      const key=event.key.toLowerCase();
      const {play,record,stop}=findTransportButtons();

      if(mod&&key==='s'){
        event.preventDefault();
        event.stopImmediatePropagation();
        const {save,saveAs}=findProjectButtons();
        (event.shiftKey ? saveAs : save)?.click();
        return;
      }

      if(mod&&key==='o'&&isHost){
        event.preventDefault();
        event.stopImmediatePropagation();
        fileInputRef.current?.click();
        return;
      }

      if(event.code==='Space'){
        event.preventDefault();
        event.stopImmediatePropagation();
        if(recording)(stop || record)?.click();
        else play?.click();
        return;
      }

      if(key==='r'&&!mod){
        event.preventDefault();
        event.stopImmediatePropagation();
        if(recording)(stop || record)?.click();
        else record?.click();
        return;
      }

      if(key==='s'&&!mod){
        event.preventDefault();
        event.stopImmediatePropagation();
        (stop || (recording ? record : null))?.click();
      }
    };
    window.addEventListener('keydown',onKeyDown,true);
    return()=>window.removeEventListener('keydown',onKeyDown,true);
  },[recording,isHost]);

  if(!target)return null;
  return <>
    {createPortal(
      <VoiceStudioProjectManager>
        <style>{RUNTIME_CSS}</style>
        <div className="vs-daw-runtime"><VoiceStudioDaw readOnly={!isHost}/></div>
        {isHost&&recording&&!minimized&&<button className="vs-emergency-stop" type="button" onClick={()=>{const {stop,record}=findTransportButtons();(stop || record)?.click();}}>■ Parar gravação</button>}
      </VoiceStudioProjectManager>,
      target,
    )}
    {isHost&&toolbar&&!minimized&&createPortal(<>
      <style>{RUNTIME_CSS}</style>
      <input ref={fileInputRef} hidden multiple type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.webm,.flac" onChange={event=>{if(event.target.files?.length)void importAudioFiles(event.target.files);}}/>
      <button type="button" className="vs-window-action vs-window-import" disabled={uploading||recording} aria-label="Importar áudio" title="Importar faixas de áudio (Ctrl/Cmd + O)" onClick={()=>fileInputRef.current?.click()}>＋ <span>{uploading?'IMPORTANDO…':'IMPORTAR ÁUDIO'}</span></button>
      <button type="button" className="vs-window-action vs-window-minimize" aria-label="Minimizar Voice Studio" title="Minimizar Voice Studio" onClick={()=>setMinimized(true)}>−</button>
    </>,toolbar)}
    {isHost&&minimized&&createPortal(<><style>{RUNTIME_CSS}</style><button type="button" className="vs-restore-studio" onClick={()=>setMinimized(false)}>🎙 Voice Studio · Restaurar</button></>,document.body)}
    {draggingFiles&&isHost&&!recording&&createPortal(<><style>{RUNTIME_CSS}</style><div className="vs-drop-overlay"><div className="vs-drop-card"><strong>Solte suas faixas aqui</strong><span>Importe uma música, playback ou várias pistas de áudio de uma só vez.</span></div></div></>,document.body)}
    {uploadMessage&&createPortal(<><style>{RUNTIME_CSS}</style><div className={`vs-upload-status ${uploadError?'error':''}`} role={uploadError?'alert':'status'}>{uploadMessage}</div></>,document.body)}
  </>;
}
