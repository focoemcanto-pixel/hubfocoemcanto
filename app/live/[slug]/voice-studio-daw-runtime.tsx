'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VoiceStudioDaw from './voice-studio-daw';
import VoiceStudioProjectManager from './voice-studio-project-manager';

const RUNTIME_CSS = `
.vs-daw-runtime{height:100%;min-height:0;position:relative}
.vs-daw-runtime .vs-daw{height:100%;min-height:0;display:flex;flex-direction:column}
.vs-daw-runtime .vs-transport{position:sticky!important;top:0;z-index:90;order:0;flex:0 0 auto;background:#11141b;box-shadow:0 1px 0 #2c313d,0 8px 20px rgba(0,0,0,.22)}
.vs-daw-runtime .vs-options{order:1;flex:0 0 auto}
.vs-daw-runtime .vs-editor{order:2;min-height:0;flex:1 1 auto}
.vs-window-minimize{width:38px;height:38px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font-size:24px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;margin-left:8px}
.vs-window-minimize:hover{background:rgba(255,255,255,.14)}
.fl-studio-scene.app-voice.vs-minimized{position:fixed!important;inset:auto 20px 20px auto!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;z-index:10000!important;background:transparent!important;box-shadow:none!important;pointer-events:none}
.fl-studio-scene.app-voice.vs-minimized>.fl-scene-toolbar,.fl-studio-scene.app-voice.vs-minimized>.fl-studio-app-canvas{display:none!important}
.vs-restore-studio{position:fixed;right:20px;bottom:20px;z-index:10001;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:#171a22;color:#fff;padding:13px 17px;font-weight:800;box-shadow:0 16px 40px rgba(0,0,0,.42);cursor:pointer;pointer-events:auto}
.vs-restore-studio:hover{background:#232735}
.vs-emergency-stop{position:fixed;right:28px;top:238px;z-index:10000;border:1px solid rgba(255,255,255,.22);border-radius:10px;background:#dc2626;color:#fff;font-weight:800;padding:11px 18px;box-shadow:0 10px 30px rgba(0,0,0,.38);cursor:pointer}
.vs-emergency-stop:hover{background:#ef4444}
@media(max-width:900px){.vs-emergency-stop{right:14px;top:190px}.vs-restore-studio{right:12px;bottom:12px}}
`;

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

export default function VoiceStudioDawRuntime(){
  const [target,setTarget]=useState<Element|null>(null);
  const [toolbar,setToolbar]=useState<Element|null>(null);
  const [isHost,setIsHost]=useState(false);
  const [recording,setRecording]=useState(false);
  const [minimized,setMinimized]=useState(false);

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

  useEffect(()=>{
    const scene=document.querySelector('.fl-studio-scene.app-voice');
    scene?.classList.toggle('vs-minimized',minimized);
    return()=>scene?.classList.remove('vs-minimized');
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
        {isHost&&recording&&!minimized&&<button className="vs-emergency-stop" type="button" onClick={()=>{const {stop,record}=findTransportButtons();(stop || record)?.click();}}>■ Parar gravação</button>}
      </VoiceStudioProjectManager>,
      target,
    )}
    {isHost&&toolbar&&!minimized&&createPortal(<button type="button" className="vs-window-minimize" aria-label="Minimizar Voice Studio" title="Minimizar Voice Studio" onClick={()=>setMinimized(true)}>−</button>,toolbar)}
    {isHost&&minimized&&createPortal(<><style>{RUNTIME_CSS}</style><button type="button" className="vs-restore-studio" onClick={()=>setMinimized(false)}>🎙 Voice Studio · Restaurar</button></>,document.body)}
  </>;
}
