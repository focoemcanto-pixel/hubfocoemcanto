'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VoiceStudioDaw from './voice-studio-daw';
import VoiceStudioProjectManager from './voice-studio-project-manager';

const RUNTIME_CSS = `
.vs-daw-runtime{height:100%;min-height:0;position:relative}
.vs-daw-runtime .vs-daw{height:100%;min-height:0;display:flex;flex-direction:column}
.vs-daw-runtime .vs-transport{position:sticky!important;top:0;z-index:80;order:0;flex:0 0 auto;background:#11141b;box-shadow:0 1px 0 #2c313d,0 8px 20px rgba(0,0,0,.22)}
.vs-daw-runtime .vs-options{order:1;flex:0 0 auto}
.vs-daw-runtime .vs-editor{order:2;min-height:0;flex:1 1 auto}
.vs-emergency-stop{position:fixed;right:28px;top:238px;z-index:10000;border:1px solid rgba(255,255,255,.22);border-radius:10px;background:#dc2626;color:#fff;font-weight:800;padding:11px 18px;box-shadow:0 10px 30px rgba(0,0,0,.38);cursor:pointer}
.vs-emergency-stop:hover{background:#ef4444}
.vs-minimize-button{width:38px;height:38px;border:0;border-radius:9px;background:#202632;color:#d9dee8;display:grid;place-items:center;font-size:22px;line-height:1;cursor:pointer}
.vs-minimize-button:hover{background:#303746;color:#fff}
.fl-studio-scene.app-voice.vs-studio-minimized{display:none!important}
.vs-studio-restore{position:fixed;right:22px;bottom:22px;z-index:2147483646;display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:#151923;color:#fff;padding:12px 16px;font-weight:800;box-shadow:0 14px 42px rgba(0,0,0,.46);cursor:pointer}
.vs-studio-restore:hover{background:#202636;transform:translateY(-1px)}
.vs-studio-restore i{width:9px;height:9px;border-radius:50%;background:#8b5cf6;box-shadow:0 0 0 4px rgba(139,92,246,.18)}
@media(max-width:900px){.vs-emergency-stop{right:14px;top:190px}.vs-studio-restore{right:14px;bottom:14px}}
`;

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}

function transportButtons() {
  const root = document.querySelector('.vs-daw-runtime');
  const controls = root?.querySelector('.vs-main-controls');
  return {
    play: controls?.querySelector('button:first-of-type') as HTMLButtonElement | null,
    record: controls?.querySelector('button:nth-of-type(2)') as HTMLButtonElement | null,
  };
}

export default function VoiceStudioDawRuntime(){
  const [target,setTarget]=useState<Element|null>(null);
  const [toolbar,setToolbar]=useState<Element|null>(null);
  const [scene,setScene]=useState<HTMLElement|null>(null);
  const [isHost,setIsHost]=useState(false);
  const [recording,setRecording]=useState(false);
  const [minimized,setMinimized]=useState(false);

  useEffect(()=>{
    setIsHost(new URLSearchParams(window.location.search).get('host')==='1');
    const sync=()=>{
      const nextScene=document.querySelector('.fl-studio-scene.app-voice') as HTMLElement|null;
      setScene(nextScene);
      setTarget(nextScene?.querySelector('.fl-studio-app-canvas')??null);
      setToolbar(nextScene?.querySelector('.fl-scene-toolbar')??null);
    };
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    sync();
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!target)return;
    const syncRecording=()=>setRecording(Boolean(document.querySelector('.vs-daw-runtime .vs-main-controls button.recording')));
    const observer=new MutationObserver(syncRecording);
    observer.observe(target,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    syncRecording();
    return()=>observer.disconnect();
  },[target]);

  useEffect(()=>{
    scene?.classList.toggle('vs-studio-minimized',minimized);
    return()=>scene?.classList.remove('vs-studio-minimized');
  },[minimized,scene]);

  useEffect(()=>{
    if(!scene)setMinimized(false);
  },[scene]);

  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(isEditableTarget(event.target)||event.altKey)return;
      const mod=event.ctrlKey||event.metaKey;
      const key=event.key.toLowerCase();
      const {play,record}=transportButtons();

      if(event.code==='Space'){
        event.preventDefault();
        event.stopImmediatePropagation();
        if(recording) record?.click();
        else play?.click();
        return;
      }

      if(key==='r'&&!mod){
        event.preventDefault();
        event.stopImmediatePropagation();
        record?.click();
      }
    };
    window.addEventListener('keydown',onKeyDown,true);
    return()=>window.removeEventListener('keydown',onKeyDown,true);
  },[recording]);

  if(!target)return null;
  return <>
    {createPortal(
      <VoiceStudioProjectManager>
        <style>{RUNTIME_CSS}</style>
        <div className="vs-daw-runtime"><VoiceStudioDaw readOnly={!isHost}/></div>
        {isHost&&recording&&!minimized&&<button className="vs-emergency-stop" type="button" onClick={()=>transportButtons().record?.click()}>■ Parar gravação</button>}
      </VoiceStudioProjectManager>,
      target,
    )}
    {isHost&&toolbar&&createPortal(<button className="vs-minimize-button" type="button" title="Minimizar Voice Studio" aria-label="Minimizar Voice Studio" onClick={()=>setMinimized(true)}>−</button>,toolbar)}
    {minimized&&createPortal(<button className="vs-studio-restore" type="button" onClick={()=>setMinimized(false)}><i/>Voice Studio <span>Restaurar</span></button>,document.body)}
  </>;
}
