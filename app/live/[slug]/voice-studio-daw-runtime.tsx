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
@media(max-width:900px){.vs-emergency-stop{right:14px;top:190px}}
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
  const [isHost,setIsHost]=useState(false);
  const [recording,setRecording]=useState(false);

  useEffect(()=>{
    setIsHost(new URLSearchParams(window.location.search).get('host')==='1');
    const sync=()=>setTarget(document.querySelector('.fl-studio-scene.app-voice .fl-studio-app-canvas'));
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
  return createPortal(
    <VoiceStudioProjectManager>
      <style>{RUNTIME_CSS}</style>
      <div className="vs-daw-runtime"><VoiceStudioDaw readOnly={!isHost}/></div>
      {isHost&&recording&&<button className="vs-emergency-stop" type="button" onClick={()=>transportButtons().record?.click()}>■ Parar gravação</button>}
    </VoiceStudioProjectManager>,
    target,
  );
}