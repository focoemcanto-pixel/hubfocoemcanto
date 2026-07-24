'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Check, Eye, EyeOff, Plus, Radio, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react';

type Poll = { id:string; question:string; options:string[]; open:boolean; showResults:boolean; anonymous:boolean; correctIndex:number|null; createdAt:number };
type Vote = { option:number; name:string };
type PollMessage =
  | { type:'foco-live-poll'; action:'publish'|'update'|'close'; poll:Poll }
  | { type:'foco-live-poll'; action:'vote'; pollId:string; option:number; voterId:string; name:string };
type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };

const emptyOptions = ['','',''];

export default function LivePollRuntime() {
  const [roomReady,setRoomReady] = useState(false);
  const [isHost,setIsHost] = useState(false);
  const [open,setOpen] = useState(false);
  const [question,setQuestion] = useState('');
  const [options,setOptions] = useState(emptyOptions);
  const [anonymous,setAnonymous] = useState(true);
  const [correctIndex,setCorrectIndex] = useState<number|null>(null);
  const [poll,setPoll] = useState<Poll|null>(null);
  const [votes,setVotes] = useState<Record<string,Vote>>({});
  const [myVote,setMyVote] = useState<number|null>(null);
  const callRef = useRef<any>(null);
  const root = roomReady ? document.querySelector('.fl-room') : null;

  useEffect(()=>{
    setIsHost(new URLSearchParams(location.search).get('host')==='1');
    const sync=()=>{ setRoomReady(Boolean(document.querySelector('.fl-room'))); callRef.current=(window as LiveWindow).__FOCO_LIVE_CALL__||callRef.current; };
    const observer=new MutationObserver(sync); observer.observe(document.body,{childList:true,subtree:true});
    const timer=window.setInterval(sync,500); sync();
    return()=>{observer.disconnect();window.clearInterval(timer)};
  },[]);

  useEffect(()=>{ const fn=()=>setOpen(current=>!current); window.addEventListener('foco-poll-toggle',fn); return()=>window.removeEventListener('foco-poll-toggle',fn); },[]);

  useEffect(()=>{
    let attached:any=null;
    const onMessage=(event:any)=>{
      const data=event?.data as PollMessage|undefined;
      if(data?.type!=='foco-live-poll') return;
      if(data.action==='vote' && isHost){
        setVotes(current=> data.pollId===poll?.id ? {...current,[data.voterId]:{option:data.option,name:data.name}} : current);
        return;
      }
      if(data.action==='publish'||data.action==='update'||data.action==='close'){
        if(isHost) return;
        setPoll(data.poll); setMyVote(null); setOpen(data.poll.open || data.poll.showResults);
      }
    };
    const onJoin=()=>{ if(isHost&&poll) callRef.current?.sendAppMessage?.({type:'foco-live-poll',action:'update',poll},'*'); };
    const bind=()=>{ const call=(window as LiveWindow).__FOCO_LIVE_CALL__; if(!call||call===attached)return; attached?.off?.('app-message',onMessage); attached?.off?.('participant-joined',onJoin); attached=call; call.on?.('app-message',onMessage); call.on?.('participant-joined',onJoin); };
    bind(); const timer=window.setInterval(bind,500);
    return()=>{window.clearInterval(timer);attached?.off?.('app-message',onMessage);attached?.off?.('participant-joined',onJoin)};
  },[isHost,poll]);

  const counts=useMemo(()=> poll ? poll.options.map((_,index)=>Object.values(votes).filter(v=>v.option===index).length) : [],[poll,votes]);
  const total=Object.keys(votes).length;

  function publish(){
    const clean=options.map(v=>v.trim()).filter(Boolean);
    if(!question.trim()||clean.length<2) return;
    const next:Poll={id:crypto.randomUUID(),question:question.trim(),options:clean,open:true,showResults:false,anonymous,correctIndex:correctIndex!==null&&correctIndex<clean.length?correctIndex:null,createdAt:Date.now()};
    setPoll(next);setVotes({});setMyVote(null);setOpen(true);
    callRef.current?.sendAppMessage?.({type:'foco-live-poll',action:'publish',poll:next},'*');
  }
  function closeVoting(){ if(!poll)return; const next={...poll,open:false,showResults:true};setPoll(next);callRef.current?.sendAppMessage?.({type:'foco-live-poll',action:'close',poll:next},'*'); }
  function toggleResults(){ if(!poll)return; const next={...poll,showResults:!poll.showResults};setPoll(next);callRef.current?.sendAppMessage?.({type:'foco-live-poll',action:'update',poll:next},'*'); }
  function vote(index:number){
    if(!poll?.open||myVote!==null)return;
    const call=callRef.current; const local=call?.participants?.()?.local;
    const voterId=local?.session_id||local?.user_id||crypto.randomUUID(); const name=local?.user_name||'Participante';
    setMyVote(index); call?.sendAppMessage?.({type:'foco-live-poll',action:'vote',pollId:poll.id,option:index,voterId,name},'*');
  }
  function newPoll(){setPoll(null);setVotes({});setQuestion('');setOptions(emptyOptions);setCorrectIndex(null);setOpen(true)}

  if(!root||!open)return null;
  return createPortal(<section className={`fl-live-poll${!isHost?' viewer':''}`}>
    <header><div><small>FOCO LIVE</small><strong><BarChart3 size={18}/> Enquete da aula</strong></div><button onClick={()=>setOpen(false)}><X size={18}/></button></header>
    {isHost&&!poll&&<div className="fl-poll-builder">
      <div className="fl-poll-inspiration"><Sparkles size={17}/><span>Crie perguntas de percepção, técnica vocal, repertório ou opinião.</span></div>
      <label>Pergunta<input value={question} maxLength={180} onChange={e=>setQuestion(e.target.value)} placeholder="Ex.: Qual voz está fazendo a terça?"/></label>
      <div className="fl-poll-options-editor">{options.map((value,index)=><div key={index}><button className={correctIndex===index?'correct':''} title="Marcar resposta correta" onClick={()=>setCorrectIndex(correctIndex===index?null:index)}><Check/></button><input value={value} maxLength={90} onChange={e=>setOptions(current=>current.map((item,i)=>i===index?e.target.value:item))} placeholder={`Opção ${index+1}`}/>{options.length>2&&<button onClick={()=>{setOptions(current=>current.filter((_,i)=>i!==index));if(correctIndex===index)setCorrectIndex(null)}}><Trash2/></button>}</div>)}</div>
      {options.length<5&&<button className="fl-poll-add" onClick={()=>setOptions(current=>[...current,''])}><Plus/> Adicionar opção</button>}
      <label className="fl-poll-switch"><input type="checkbox" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)}/><span/> Votação anônima</label>
      <button className="fl-poll-publish" onClick={publish}><Send/> Publicar enquete</button>
    </div>}
    {poll&&<div className="fl-poll-active">
      <div className="fl-poll-status"><Radio size={15}/><span>{poll.open?'Votação aberta':'Votação encerrada'}</span><b>{total} {total===1?'resposta':'respostas'}</b></div>
      <h2>{poll.question}</h2>
      <div className="fl-poll-options">{poll.options.map((option,index)=>{const pct=total?Math.round((counts[index]||0)/total*100):0;const reveal=isHost||poll.showResults;return <button key={option} disabled={isHost||!poll.open||myVote!==null} className={`${myVote===index?'selected ':''}${poll.correctIndex===index&&(!poll.open||poll.showResults)?'correct':''}`} onClick={()=>vote(index)}><span className="bar" style={{width:reveal?`${pct}%`:'0%'}}/><i>{String.fromCharCode(65+index)}</i><strong>{option}</strong>{reveal&&<b>{pct}%</b>}{myVote===index&&<Check/>}</button>})}</div>
      {!isHost&&myVote!==null&&poll.open&&<p className="fl-poll-thanks"><Check/> Resposta registrada! Aguarde o resultado.</p>}
      {!isHost&&!poll.open&&poll.correctIndex!==null&&<p className="fl-poll-answer">Resposta correta: <b>{poll.options[poll.correctIndex]}</b></p>}
      {isHost&&<div className="fl-poll-host-actions">{poll.open?<button className="primary" onClick={closeVoting}>Encerrar e mostrar resultado</button>:<button className="primary" onClick={newPoll}><Plus/> Nova enquete</button>}<button onClick={toggleResults}>{poll.showResults?<EyeOff/>:<Eye/>}{poll.showResults?'Ocultar resultados':'Mostrar resultados'}</button><button onClick={newPoll}><RotateCcw/> Recomeçar</button></div>}
    </div>}
  </section>,root);
}
