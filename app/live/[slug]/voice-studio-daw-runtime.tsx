'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VoiceStudioDaw from './voice-studio-daw';

export default function VoiceStudioDawRuntime(){
  const [target,setTarget]=useState<Element|null>(null);
  const [isHost,setIsHost]=useState(false);
  useEffect(()=>{
    setIsHost(new URLSearchParams(window.location.search).get('host')==='1');
    const sync=()=>setTarget(document.querySelector('.fl-studio-scene.app-voice .fl-studio-app-canvas'));
    const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});sync();
    return()=>observer.disconnect();
  },[]);
  if(!target)return null;
  return createPortal(<div className="vs-daw-runtime"><VoiceStudioDaw readOnly={!isHost}/></div>,target);
}
