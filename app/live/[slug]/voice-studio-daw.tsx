'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, ChevronDown, Circle, Download, KeyboardMusic, Mic2, Pause, Play, Plus, Square, Trash2, Volume2 } from 'lucide-react';

type Status = 'idle' | 'countin' | 'recording' | 'playing';
type TrackKind = 'audio' | 'midi';
type MidiNote = { id:string; note:number; velocity:number; start:number; duration:number };
type Track = { id:string; kind:TrackKind; name:string; color:string; url?:string; blob?:Blob; duration:number; peaks:number[]; notes:MidiNote[]; instrument:string; muted:boolean; solo:boolean; volume:number };
type ArmedTrack = { kind:TrackKind; instrument:string };

const COLORS=['#22c55e','#8b5cf6','#0ea5e9','#f97316','#ec4899','#eab308'];
const BARS=16;
const INSTRUMENTS=[['piano','Piano'],['electric','Piano elétrico'],['organ','Órgão'],['pad','Pad'],['strings','Strings']] as const;

function timeLabel(seconds:number){const m=Math.floor(seconds/60);const s=Math.floor(seconds%60);const ms=Math.floor((seconds%1)*10);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${ms}`;}
function makePeaks(data:Float32Array,count=180){const step=Math.max(1,Math.floor(data.length/count));return Array.from({length:count},(_,i)=>{let max=0;for(let j=i*step;j<Math.min(data.length,(i+1)*step);j++)max=Math.max(max,Math.abs(data[j]));return Math.max(.03,max);});}
function midiFrequency(note:number){return 440*Math.pow(2,(note-69)/12);}
function instrumentWave(instrument:string):OscillatorType{return instrument==='organ'?'square':instrument==='strings'||instrument==='pad'?'sawtooth':instrument==='electric'?'triangle':'sine';}

export default function VoiceStudioDaw({readOnly}:{readOnly:boolean}){
  const [tracks,setTracks]=useState<Track[]>([]);
  const [status,setStatus]=useState<Status>('idle');
  const [tempo,setTempo]=useState(90);
  const [countInBars,setCountInBars]=useState(1);
  const [metroDuring,setMetroDuring]=useState(true);
  const [countBeat,setCountBeat]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [meter,setMeter]=useState(0);
  const [error,setError]=useState('');
  const [trackMenu,setTrackMenu]=useState(false);
  const [armed,setArmed]=useState<ArmedTrack>({kind:'audio',instrument:'piano'});
  const [midiInputs,setMidiInputs]=useState<any[]>([]);
  const [midiInputId,setMidiInputId]=useState('');
  const [midiSupported,setMidiSupported]=useState(true);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const streamRef=useRef<MediaStream|null>(null);
  const contextRef=useRef<AudioContext|null>(null);
  const analyserRef=useRef<AnalyserNode|null>(null);
  const rafRef=useRef<number|null>(null);
  const timerRef=useRef<number|null>(null);
  const metroRef=useRef<number|null>(null);
  const playAudiosRef=useRef<HTMLAudioElement[]>([]);
  const scheduledNodesRef=useRef<Array<OscillatorNode|GainNode>>([]);
  const startAtRef=useRef(0);
  const playbackOffsetRef=useRef(0);
  const livePeaksRef=useRef<number[]>([]);
  const [livePeaks,setLivePeaks]=useState<number[]>([]);
  const midiAccessRef=useRef<any>(null);
  const activeMidiRef=useRef<Map<number,{start:number;velocity:number}>>(new Map());
  const midiNotesRef=useRef<MidiNote[]>([]);
  const liveOscRef=useRef<Map<number,{osc:OscillatorNode;gain:GainNode}>>(new Map());

  const beatSeconds=60/tempo;
  const projectDuration=Math.max(8,...tracks.map(t=>t.duration),elapsed);
  const soloed=tracks.some(t=>t.solo);
  const playhead=Math.min(100,(elapsed/projectDuration)*100);

  useEffect(()=>()=>cleanup(),[]);
  useEffect(()=>{if(status!=='recording'&&status!=='countin')stopMetronome();},[status]);
  useEffect(()=>{void connectMidi();},[]);
  useEffect(()=>{bindMidiInput();return unbindMidiInput;},[midiInputId,status,armed.kind,armed.instrument]);

  function audioContext(){contextRef.current ||= new AudioContext({latencyHint:'interactive'});return contextRef.current;}
  function click(accent=false){const ctx=audioContext();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.value=accent?1320:930;gain.gain.setValueAtTime(.16,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.055);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.06);}
  function startMetronome(){stopMetronome();click(true);let beat=1;metroRef.current=window.setInterval(()=>{click(beat%4===0);beat++;},beatSeconds*1000);}
  function stopMetronome(){if(metroRef.current){window.clearInterval(metroRef.current);metroRef.current=null;}}
  function clearPlayback(reset=false){playAudiosRef.current.forEach(a=>{a.pause();a.src='';});playAudiosRef.current=[];scheduledNodesRef.current.forEach(node=>{try{if('stop' in node)(node as OscillatorNode).stop();node.disconnect();}catch{}});scheduledNodesRef.current=[];if(reset)setElapsed(0);}
  function cleanup(){if(timerRef.current)window.clearInterval(timerRef.current);if(metroRef.current)window.clearInterval(metroRef.current);if(rafRef.current)cancelAnimationFrame(rafRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());clearPlayback();unbindMidiInput();void contextRef.current?.close().catch(()=>undefined);}

  async function connectMidi(){const nav=navigator as Navigator&{requestMIDIAccess?:()=>Promise<any>};if(!nav.requestMIDIAccess){setMidiSupported(false);return;}try{const access=await nav.requestMIDIAccess();midiAccessRef.current=access;const load=()=>{const inputs=Array.from(access.inputs.values()) as any[];setMidiInputs(inputs);setMidiInputId(current=>current||inputs[0]?.id||'');};load();access.onstatechange=load;}catch{setError('Permita o acesso MIDI no navegador para usar o teclado.');}}
  function selectedMidiInput(){return midiInputs.find(input=>input.id===midiInputId);}
  function bindMidiInput(){const input=selectedMidiInput();if(input)input.onmidimessage=handleMidiMessage;}
  function unbindMidiInput(){midiInputs.forEach(input=>{if(input.onmidimessage===handleMidiMessage)input.onmidimessage=null;});}
  function handleMidiMessage(event:any){const [command,note,velocity]=event.data as [number,number,number];const type=command&0xf0;const noteOn=type===0x90&&velocity>0;const noteOff=type===0x80||(type===0x90&&velocity===0);if(noteOn){playLiveNote(note,velocity,armed.instrument);if(status==='recording'&&armed.kind==='midi')activeMidiRef.current.set(note,{start:(performance.now()-startAtRef.current)/1000,velocity});}if(noteOff){stopLiveNote(note);const active=activeMidiRef.current.get(note);if(active&&status==='recording'&&armed.kind==='midi'){midiNotesRef.current.push({id:crypto.randomUUID(),note,velocity:active.velocity,start:active.start,duration:Math.max(.04,(performance.now()-startAtRef.current)/1000-active.start)});activeMidiRef.current.delete(note);}}}
  function playLiveNote(note:number,velocity:number,instrument:string){const ctx=audioContext();void ctx.resume();stopLiveNote(note);const osc=ctx.createOscillator();const gain=ctx.createGain();osc.type=instrumentWave(instrument);osc.frequency.value=midiFrequency(note);gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(Math.max(.025,(velocity/127)*.18),ctx.currentTime+.012);osc.connect(gain).connect(ctx.destination);osc.start();liveOscRef.current.set(note,{osc,gain});}
  function stopLiveNote(note:number){const voice=liveOscRef.current.get(note);if(!voice)return;const ctx=audioContext();voice.gain.gain.cancelScheduledValues(ctx.currentTime);voice.gain.gain.setTargetAtTime(.0001,ctx.currentTime,.04);voice.osc.stop(ctx.currentTime+.2);liveOscRef.current.delete(note);}

  async function countIn(){const totalBeats=countInBars*4;if(totalBeats<=0)return;setStatus('countin');setCountBeat(1);click(true);let beat=1;await new Promise<void>(resolve=>{const id=window.setInterval(()=>{beat++;if(beat>totalBeats){window.clearInterval(id);resolve();return;}setCountBeat(beat);click((beat-1)%4===0);},beatSeconds*1000);});}
  async function beginRecord(){if(readOnly||status!=='idle')return;setError('');setElapsed(0);playbackOffsetRef.current=0;setLivePeaks([]);livePeaksRef.current=[];midiNotesRef.current=[];activeMidiRef.current.clear();try{await audioContext().resume();if(armed.kind==='audio')await prepareAudio();else if(!selectedMidiInput())throw new Error('Conecte e selecione um teclado MIDI.');await countIn();startBackingTracks(0);if(armed.kind==='audio')startAudioRecorder();else startMidiRecorder();}catch(reason){setStatus('idle');setError(reason instanceof Error?reason.message:'Não foi possível iniciar a gravação.');cleanupCapture();}}
  async function prepareAudio(){const deviceId=localStorage.getItem('foco-live-microphone-device');const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});streamRef.current=stream;const ctx=audioContext();const source=ctx.createMediaStreamSource(stream);const analyser=ctx.createAnalyser();analyser.fftSize=512;source.connect(analyser);analyserRef.current=analyser;watchInput();}
  function startClock(){startAtRef.current=performance.now();setElapsed(0);setStatus('recording');if(metroDuring)startMetronome();timerRef.current=window.setInterval(()=>setElapsed((performance.now()-startAtRef.current)/1000),50);}
  function startAudioRecorder(){const stream=streamRef.current;if(!stream)return;const recorder=new MediaRecorder(stream);recorderRef.current=recorder;chunksRef.current=[];recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data);};recorder.onstop=()=>void finishAudio(recorder);recorder.start(100);startClock();}
  function startMidiRecorder(){startClock();}
  function watchInput(){const analyser=analyserRef.current;if(!analyser)return;const data=new Uint8Array(analyser.frequencyBinCount);const draw=()=>{analyser.getByteTimeDomainData(data);let sum=0,max=0;for(const v of data){const n=Math.abs((v-128)/128);sum+=n*n;max=Math.max(max,n);}setMeter(Math.min(1,Math.sqrt(sum/data.length)*3));if(recorderRef.current?.state==='recording'){livePeaksRef.current.push(Math.max(.03,max));if(livePeaksRef.current.length>220)livePeaksRef.current.shift();setLivePeaks([...livePeaksRef.current]);}rafRef.current=requestAnimationFrame(draw);};draw();}
  function cleanupCapture(){if(timerRef.current)window.clearInterval(timerRef.current);timerRef.current=null;stopMetronome();clearPlayback();if(rafRef.current)cancelAnimationFrame(rafRef.current);rafRef.current=null;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setMeter(0);}
  function stopRecording(){if(armed.kind==='audio'&&recorderRef.current?.state==='recording')recorderRef.current.stop();else if(armed.kind==='midi')finishMidi();}
  async function finishAudio(recorder:MediaRecorder){const duration=(performance.now()-startAtRef.current)/1000;const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});const url=URL.createObjectURL(blob);let peaks=livePeaksRef.current;try{const buffer=await audioContext().decodeAudioData(await blob.arrayBuffer());peaks=makePeaks(buffer.getChannelData(0));}catch{}addTrack({kind:'audio',url,blob,duration,peaks,notes:[],instrument:'',name:`Voz ${tracks.filter(t=>t.kind==='audio').length+1}`});cleanupCapture();setElapsed(0);setStatus('idle');}
  function finishMidi(){const duration=(performance.now()-startAtRef.current)/1000;activeMidiRef.current.forEach((active,note)=>midiNotesRef.current.push({id:crypto.randomUUID(),note,velocity:active.velocity,start:active.start,duration:Math.max(.04,duration-active.start)}));activeMidiRef.current.clear();addTrack({kind:'midi',duration,peaks:[],notes:[...midiNotesRef.current],instrument:armed.instrument,name:`Teclado ${tracks.filter(t=>t.kind==='midi').length+1}`});cleanupCapture();setElapsed(0);setStatus('idle');}
  function addTrack(data:Pick<Track,'kind'|'name'|'duration'|'peaks'|'notes'|'instrument'> & Partial<Pick<Track,'url'|'blob'>>){setTracks(current=>[...current,{id:crypto.randomUUID(),color:COLORS[current.length%COLORS.length],muted:false,solo:false,volume:1,...data}]);}

  function playableTracks(){return tracks.filter(t=>!t.muted&&(!soloed||t.solo));}
  function startBackingTracks(offset:number){clearPlayback();const ctx=audioContext();const playable=playableTracks();playAudiosRef.current=playable.filter(t=>t.kind==='audio'&&t.url&&offset<t.duration).map(t=>{const a=new Audio(t.url);a.volume=t.volume;a.currentTime=Math.max(0,offset);void a.play();return a;});playable.filter(t=>t.kind==='midi').forEach(track=>scheduleMidiTrack(track,ctx.currentTime,offset));}
  function playAll(){if(status==='playing'){stopPlayback();return;}if(!tracks.length)return;const offset=elapsed>=projectDuration?0:elapsed;playbackOffsetRef.current=offset;void audioContext().resume();startBackingTracks(offset);startAtRef.current=performance.now();setStatus('playing');timerRef.current=window.setInterval(()=>{const next=playbackOffsetRef.current+(performance.now()-startAtRef.current)/1000;setElapsed(next);if(next>=projectDuration)stopPlayback(true);},50);}
  function scheduleMidiTrack(track:Track,base:number,offset=0){const ctx=audioContext();track.notes.forEach(note=>{const noteEnd=note.start+note.duration;if(noteEnd<=offset)return;const start=base+Math.max(0,note.start-offset);const remaining=noteEnd-Math.max(offset,note.start);const end=start+remaining;const osc=ctx.createOscillator();const gain=ctx.createGain();osc.type=instrumentWave(track.instrument);osc.frequency.value=midiFrequency(note.note);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime((note.velocity/127)*.16*track.volume,start+.01);gain.gain.setTargetAtTime(.0001,end,.04);osc.connect(gain).connect(ctx.destination);osc.start(start);osc.stop(end+.2);scheduledNodesRef.current.push(osc,gain);});}
  function stopPlayback(reset=false){if(timerRef.current)window.clearInterval(timerRef.current);timerRef.current=null;clearPlayback(reset);setStatus('idle');}
  function seekTimeline(event:React.MouseEvent<HTMLElement>){if(status!=='idle')return;const rect=event.currentTarget.getBoundingClientRect();const ratio=Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width));setElapsed(ratio*projectDuration);}
  function patch(id:string,value:Partial<Track>){setTracks(c=>c.map(t=>t.id===id?{...t,...value}:t));}
  function remove(id:string){setTracks(c=>{const t=c.find(x=>x.id===id);if(t?.url)URL.revokeObjectURL(t.url);return c.filter(x=>x.id!==id);});}
  function exportTracks(){tracks.forEach(t=>{if(t.kind==='audio'&&t.url){download(t.url,`${slug(t.name)}.webm`);}else if(t.kind==='midi'){const blob=createMidiFile(t.notes,tempo);download(URL.createObjectURL(blob),`${slug(t.name)}.mid`,true);}});}
  function download(url:string,name:string,revoke=false){const a=document.createElement('a');a.href=url;a.download=name;a.click();if(revoke)setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function slug(value:string){return value.replace(/\s+/g,'-').toLowerCase();}
  function selectTrack(kind:TrackKind){setArmed(current=>({...current,kind}));setTrackMenu(false);}

  const ruler=useMemo(()=>Array.from({length:BARS},(_,i)=>i+1),[]);
  return <div className="vs-daw">
    <header className="vs-transport"><div className="vs-project"><strong>Voice Studio</strong><span>Áudio e MIDI multipista</span></div><div className="vs-tempo"><input disabled={readOnly||status!=='idle'} value={tempo} min={40} max={220} type="number" onChange={e=>setTempo(Number(e.target.value)||90)}/><span>BPM</span><b>4 / 4</b></div><div className="vs-main-controls"><button onClick={playAll} disabled={!tracks.length||status==='recording'||status==='countin'}>{status==='playing'?<Pause/>:<Play/>}</button><button className={status==='recording'?'recording':'record'} onClick={status==='recording'?stopRecording:beginRecord} disabled={readOnly||status==='countin'||status==='playing'}>{status==='recording'?<Square/>:<Circle fill="currentColor"/>}</button><time>{timeLabel(elapsed)}</time></div>{!readOnly&&<button className="vs-export" disabled={!tracks.length} onClick={exportTracks}><Download/> Exportar</button>}</header>
    <section className="vs-options"><label>Contagem<select disabled={status!=='idle'||readOnly} value={countInBars} onChange={e=>setCountInBars(Number(e.target.value))}><option value={0}>Sem contagem</option><option value={1}>1 compasso</option><option value={2}>2 compassos</option></select></label><button className={metroDuring?'active':''} disabled={status!=='idle'||readOnly} onClick={()=>setMetroDuring(v=>!v)}>Metrônomo durante a gravação</button>{armed.kind==='midi'?<><label>Teclado<select disabled={status!=='idle'||readOnly} value={midiInputId} onChange={e=>setMidiInputId(e.target.value)}><option value="">Selecione</option>{midiInputs.map(input=><option key={input.id} value={input.id}>{input.name||'Teclado MIDI'}</option>)}</select></label><label>Timbre<select disabled={status!=='idle'||readOnly} value={armed.instrument} onChange={e=>setArmed(v=>({...v,instrument:e.target.value}))}>{INSTRUMENTS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></>:<div className="vs-input"><Mic2/><span>Nível de entrada</span><i><b style={{width:`${meter*100}%`}}/></i></div>}{error&&<em>{error}</em>}{!midiSupported&&<em>Este navegador não oferece Web MIDI.</em>}</section>
    <div className="vs-editor"><aside className="vs-track-heads"><div className="vs-add-wrap"><button className="vs-add" onClick={()=>setTrackMenu(v=>!v)} disabled={readOnly||status!=='idle'}><Plus/> ADICIONAR FAIXA <ChevronDown/></button>{trackMenu&&<div className="vs-track-menu"><button onClick={()=>selectTrack('audio')}><AudioLines/><div><b>Voz / Áudio</b><small>Gravação pelo microfone</small></div></button><button disabled={!midiSupported} onClick={()=>selectTrack('midi')}><KeyboardMusic/><div><b>Teclado MIDI</b><small>Notas, velocity e sustain</small></div></button></div>}</div>{tracks.map((t,i)=><article key={t.id} style={{'--track':t.color} as React.CSSProperties}><span>{t.kind==='midi'?<KeyboardMusic/>:String(i+1).padStart(2,'0')}</span><input disabled={readOnly} value={t.name} onChange={e=>patch(t.id,{name:e.target.value})}/><div><button className={t.muted?'active':''} disabled={readOnly} onClick={()=>patch(t.id,{muted:!t.muted})}>M</button><button className={t.solo?'solo':''} disabled={readOnly} onClick={()=>patch(t.id,{solo:!t.solo})}>S</button>{!readOnly&&<button onClick={()=>remove(t.id)}><Trash2/></button>}</div><label><Volume2/><input disabled={readOnly} type="range" min="0" max="1" step=".05" value={t.volume} onChange={e=>patch(t.id,{volume:Number(e.target.value)})}/></label></article>)}{(status==='recording'||status==='countin')&&<article className="armed"><span>●</span><strong>{armed.kind==='midi'?'Nova faixa MIDI':'Nova voz'}</strong><small>{status==='countin'?'Preparando…':'GRAVANDO'}</small></article>}</aside><main className="vs-timeline" onClick={seekTimeline}><div className="vs-ruler">{ruler.map(n=><span key={n}>{n}</span>)}</div><div className="vs-playhead" style={{left:`${playhead}%`}}/>{tracks.map(t=><div className={`vs-lane ${t.kind}`} key={t.id}><div className="vs-clip" style={{'--clip':t.color,width:`${Math.max(8,(t.duration/projectDuration)*100)}%`} as React.CSSProperties}><b>{t.name}</b>{t.kind==='audio'?<Wave peaks={t.peaks}/>:<MidiClip notes={t.notes} duration={t.duration}/>}</div></div>)}{(status==='recording'||status==='countin')&&<div className={`vs-lane live ${armed.kind}`}><div className="vs-live-clip" style={{width:`${Math.max(1,(elapsed/projectDuration)*100)}%`}}>{armed.kind==='audio'?<Wave peaks={livePeaks}/>:<div className="vs-midi-live"><KeyboardMusic/><span>Capturando MIDI…</span></div>}</div></div>}{!tracks.length&&status==='idle'&&<div className="vs-empty">{armed.kind==='midi'?<KeyboardMusic/>:<Mic2/>}<strong>{armed.kind==='midi'?'Grave seu teclado MIDI':'Grave a voz principal'}</strong><span>{armed.kind==='midi'?'As notas aparecem como blocos editáveis na timeline.':'A contagem prepara a entrada e a forma de onda nasce em tempo real.'}</span><button onClick={event=>{event.stopPropagation();void beginRecord();}} disabled={readOnly}><Circle fill="currentColor"/> Criar primeira faixa</button></div>}</main></div>
    {status==='countin'&&<div className="vs-countin"><small>ENTRADA EM</small><strong>{((countBeat-1)%4)+1}</strong><div>{Array.from({length:4},(_,i)=><i key={i} className={i===((countBeat-1)%4)?'active':''}/>)}</div><span>Compasso {Math.ceil(countBeat/4)} de {countInBars}</span></div>}
  </div>;
}

function Wave({peaks}:{peaks:number[]}){const values=peaks.length?peaks:Array.from({length:80},()=>.04);return <svg className="vs-wave" viewBox={`0 0 ${values.length} 100`} preserveAspectRatio="none">{values.map((p,i)=><line key={i} x1={i+.5} x2={i+.5} y1={50-p*46} y2={50+p*46}/>)}</svg>;}
function MidiClip({notes,duration}:{notes:MidiNote[];duration:number}){return <div className="vs-midi-notes">{notes.map(note=>{const top=((84-Math.min(84,Math.max(36,note.note)))/48)*100;return <i key={note.id} style={{left:`${(note.start/Math.max(.1,duration))*100}%`,width:`${Math.max(1.2,(note.duration/Math.max(.1,duration))*100)}%`,top:`${top}%`,opacity:.45+(note.velocity/127)*.55}}/>})}</div>;}
function variableLength(value:number){const bytes=[value&0x7f];while((value>>=7))bytes.unshift((value&0x7f)|0x80);return bytes;}
function createMidiFile(notes:MidiNote[],tempo:number){const ppq=480;const events:Array<{tick:number;data:number[]}>=[];notes.forEach(note=>{events.push({tick:Math.round(note.start*tempo/60*ppq),data:[0x90,note.note,note.velocity]});events.push({tick:Math.round((note.start+note.duration)*tempo/60*ppq),data:[0x80,note.note,0]});});events.sort((a,b)=>a.tick-b.tick);const track:number[]=[];let last=0;const mpqn=Math.round(60000000/tempo);track.push(0,0xff,0x51,3,(mpqn>>16)&255,(mpqn>>8)&255,mpqn&255);events.forEach(event=>{track.push(...variableLength(event.tick-last),...event.data);last=event.tick;});track.push(0,0xff,0x2f,0);const header=[0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,(ppq>>8)&255,ppq&255];const length=track.length;const chunk=[0x4d,0x54,0x72,0x6b,(length>>>24)&255,(length>>>16)&255,(length>>>8)&255,length&255,...track];return new Blob([new Uint8Array([...header,...chunk])],{type:'audio/midi'});}
