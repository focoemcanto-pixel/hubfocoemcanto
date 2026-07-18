'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Download, Mic2, Pause, Play, Plus, Square, Trash2, Volume2 } from 'lucide-react';

type Status = 'idle' | 'countin' | 'recording' | 'playing';
type Track = { id:string; name:string; color:string; url:string; blob:Blob; duration:number; peaks:number[]; muted:boolean; solo:boolean; volume:number };
const COLORS=['#22c55e','#8b5cf6','#0ea5e9','#f97316','#ec4899','#eab308'];
const BARS=16;

function timeLabel(seconds:number){const m=Math.floor(seconds/60);const s=Math.floor(seconds%60);const ms=Math.floor((seconds%1)*10);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${ms}`;}
function makePeaks(data:Float32Array,count=180){const step=Math.max(1,Math.floor(data.length/count));return Array.from({length:count},(_,i)=>{let max=0;for(let j=i*step;j<Math.min(data.length,(i+1)*step);j++)max=Math.max(max,Math.abs(data[j]));return Math.max(.03,max);});}

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
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const streamRef=useRef<MediaStream|null>(null);
  const contextRef=useRef<AudioContext|null>(null);
  const analyserRef=useRef<AnalyserNode|null>(null);
  const rafRef=useRef<number|null>(null);
  const timerRef=useRef<number|null>(null);
  const metroRef=useRef<number|null>(null);
  const playAudiosRef=useRef<HTMLAudioElement[]>([]);
  const startAtRef=useRef(0);
  const livePeaksRef=useRef<number[]>([]);
  const [livePeaks,setLivePeaks]=useState<number[]>([]);

  const beatSeconds=60/tempo;
  const projectDuration=Math.max(8,...tracks.map(t=>t.duration),elapsed);
  const soloed=tracks.some(t=>t.solo);
  const playhead=Math.min(100,(elapsed/projectDuration)*100);

  useEffect(()=>()=>cleanup(),[]);
  useEffect(()=>{ if(status!=='recording'&&status!=='countin') stopMetronome(); },[status]);

  function cleanup(){
    if(timerRef.current)window.clearInterval(timerRef.current);
    if(metroRef.current)window.clearInterval(metroRef.current);
    if(rafRef.current)cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    playAudiosRef.current.forEach(a=>{a.pause();a.src='';});
    playAudiosRef.current=[];
    void contextRef.current?.close().catch(()=>undefined);
  }

  function audioContext(){contextRef.current ||= new AudioContext({latencyHint:'interactive'});return contextRef.current;}
  function click(accent=false){
    const ctx=audioContext(); const osc=ctx.createOscillator(); const gain=ctx.createGain();
    osc.frequency.value=accent?1320:930; gain.gain.setValueAtTime(.16,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.055);
    osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.06);
  }
  function startMetronome(){stopMetronome();click(true);let beat=1;metroRef.current=window.setInterval(()=>{click(beat%4===0);beat++;},beatSeconds*1000);}
  function stopMetronome(){if(metroRef.current){window.clearInterval(metroRef.current);metroRef.current=null;}}

  async function beginRecord(){
    if(readOnly||status!=='idle')return;
    setError('');setElapsed(0);setLivePeaks([]);livePeaksRef.current=[];
    try{
      const deviceId=localStorage.getItem('foco-live-microphone-device');
      const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      streamRef.current=stream;
      const ctx=audioContext();await ctx.resume();
      const source=ctx.createMediaStreamSource(stream);const analyser=ctx.createAnalyser();analyser.fftSize=512;source.connect(analyser);analyserRef.current=analyser;
      watchInput();
      const totalBeats=countInBars*4;
      if(totalBeats>0){
        setStatus('countin');setCountBeat(1);click(true);
        let beat=1;
        await new Promise<void>(resolve=>{const id=window.setInterval(()=>{beat++;if(beat>totalBeats){window.clearInterval(id);resolve();return;}setCountBeat(beat);click((beat-1)%4===0);},beatSeconds*1000);});
      }
      const recorder=new MediaRecorder(stream);recorderRef.current=recorder;chunksRef.current=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data);};
      recorder.onstop=()=>void finishRecording(recorder);
      recorder.start(100);startAtRef.current=performance.now();setElapsed(0);setStatus('recording');
      if(metroDuring)startMetronome();
      timerRef.current=window.setInterval(()=>setElapsed((performance.now()-startAtRef.current)/1000),50);
    }catch(reason){setStatus('idle');setError(reason instanceof Error?reason.message:'Não foi possível acessar o microfone.');cleanupCapture();}
  }

  function watchInput(){
    const analyser=analyserRef.current;if(!analyser)return;const data=new Uint8Array(analyser.frequencyBinCount);
    const draw=()=>{analyser.getByteTimeDomainData(data);let sum=0,max=0;for(const v of data){const n=Math.abs((v-128)/128);sum+=n*n;max=Math.max(max,n);}setMeter(Math.min(1,Math.sqrt(sum/data.length)*3));if(status==='recording'||recorderRef.current?.state==='recording'){livePeaksRef.current.push(Math.max(.03,max));if(livePeaksRef.current.length>220)livePeaksRef.current.shift();setLivePeaks([...livePeaksRef.current]);}rafRef.current=requestAnimationFrame(draw);};draw();
  }
  function cleanupCapture(){if(timerRef.current)window.clearInterval(timerRef.current);timerRef.current=null;stopMetronome();if(rafRef.current)cancelAnimationFrame(rafRef.current);rafRef.current=null;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setMeter(0);}
  function stopRecording(){if(recorderRef.current?.state==='recording')recorderRef.current.stop();}
  async function finishRecording(recorder:MediaRecorder){
    const duration=(performance.now()-startAtRef.current)/1000;const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});const url=URL.createObjectURL(blob);
    let peaks=livePeaksRef.current;
    try{const buffer=await audioContext().decodeAudioData(await blob.arrayBuffer());peaks=makePeaks(buffer.getChannelData(0));}catch{}
    setTracks(current=>[...current,{id:crypto.randomUUID(),name:`Voz ${current.length+1}`,color:COLORS[current.length%COLORS.length],url,blob,duration,peaks,muted:false,solo:false,volume:1}]);
    cleanupCapture();setElapsed(0);setStatus('idle');
  }

  function playAll(){
    if(status==='playing'){stopPlayback();return;} if(!tracks.length)return;
    playAudiosRef.current=tracks.filter(t=>!t.muted&&(!soloed||t.solo)).map(t=>{const a=new Audio(t.url);a.volume=t.volume;void a.play();return a;});
    startAtRef.current=performance.now();setStatus('playing');timerRef.current=window.setInterval(()=>{const next=(performance.now()-startAtRef.current)/1000;setElapsed(next);if(next>=projectDuration)stopPlayback();},50);
  }
  function stopPlayback(){if(timerRef.current)window.clearInterval(timerRef.current);timerRef.current=null;playAudiosRef.current.forEach(a=>a.pause());playAudiosRef.current=[];setElapsed(0);setStatus('idle');}
  function patch(id:string,value:Partial<Track>){setTracks(c=>c.map(t=>t.id===id?{...t,...value}:t));}
  function remove(id:string){setTracks(c=>{const t=c.find(x=>x.id===id);if(t)URL.revokeObjectURL(t.url);return c.filter(x=>x.id!==id);});}
  function exportTracks(){tracks.forEach(t=>{const a=document.createElement('a');a.href=t.url;a.download=`${t.name.replace(/\s+/g,'-').toLowerCase()}.webm`;a.click();});}

  const ruler=useMemo(()=>Array.from({length:BARS},(_,i)=>i+1),[]);
  return <div className="vs-daw">
    <header className="vs-transport">
      <div className="vs-project"><strong>Voice Studio</strong><span>Demonstração vocal multipista</span></div>
      <div className="vs-tempo"><input disabled={readOnly||status!=='idle'} value={tempo} min={40} max={220} type="number" onChange={e=>setTempo(Number(e.target.value)||90)}/><span>BPM</span><b>4 / 4</b></div>
      <div className="vs-main-controls">
        <button onClick={playAll} disabled={!tracks.length||status==='recording'||status==='countin'}>{status==='playing'?<Pause/>:<Play/>}</button>
        <button className={status==='recording'?'recording':'record'} onClick={status==='recording'?stopRecording:beginRecord} disabled={readOnly||status==='countin'||status==='playing'}>{status==='recording'?<Square/>:<Circle fill="currentColor"/>}</button>
        <time>{timeLabel(elapsed)}</time>
      </div>
      {!readOnly&&<button className="vs-export" disabled={!tracks.length} onClick={exportTracks}><Download/> Exportar</button>}
    </header>

    <section className="vs-options">
      <label>Contagem<select disabled={status!=='idle'||readOnly} value={countInBars} onChange={e=>setCountInBars(Number(e.target.value))}><option value={0}>Sem contagem</option><option value={1}>1 compasso</option><option value={2}>2 compassos</option></select></label>
      <button className={metroDuring?'active':''} disabled={status!=='idle'||readOnly} onClick={()=>setMetroDuring(v=>!v)}>Metrônomo durante a gravação</button>
      <div className="vs-input"><Mic2/><span>Nível de entrada</span><i><b style={{width:`${meter*100}%`}}/></i></div>
      {error&&<em>{error}</em>}
    </section>

    <div className="vs-editor">
      <aside className="vs-track-heads">
        <div className="vs-add"><Plus/> FAIXAS</div>
        {tracks.map((t,i)=><article key={t.id} style={{'--track':t.color} as React.CSSProperties}><span>{String(i+1).padStart(2,'0')}</span><input disabled={readOnly} value={t.name} onChange={e=>patch(t.id,{name:e.target.value})}/><div><button className={t.muted?'active':''} disabled={readOnly} onClick={()=>patch(t.id,{muted:!t.muted})}>M</button><button className={t.solo?'solo':''} disabled={readOnly} onClick={()=>patch(t.id,{solo:!t.solo})}>S</button>{!readOnly&&<button onClick={()=>remove(t.id)}><Trash2/></button>}</div><label><Volume2/><input disabled={readOnly} type="range" min="0" max="1" step=".05" value={t.volume} onChange={e=>patch(t.id,{volume:Number(e.target.value)})}/></label></article>)}
        {(status==='recording'||status==='countin')&&<article className="armed"><span>●</span><strong>Nova voz</strong><small>{status==='countin'?'Preparando…':'GRAVANDO'}</small></article>}
      </aside>
      <main className="vs-timeline">
        <div className="vs-ruler">{ruler.map(n=><span key={n}>{n}</span>)}</div>
        <div className="vs-playhead" style={{left:`${playhead}%`}}/>
        {tracks.map(t=><div className="vs-lane" key={t.id}><div className="vs-clip" style={{'--clip':t.color,width:`${Math.max(8,(t.duration/projectDuration)*100)}%`} as React.CSSProperties}><b>{t.name}</b><Wave peaks={t.peaks}/></div></div>)}
        {(status==='recording'||status==='countin')&&<div className="vs-lane live"><div className="vs-live-clip" style={{width:`${Math.max(1,(elapsed/projectDuration)*100)}%`}}><Wave peaks={livePeaks}/></div></div>}
        {!tracks.length&&status==='idle'&&<div className="vs-empty"><Mic2/><strong>Grave a voz principal</strong><span>A contagem prepara a entrada e a forma de onda nasce em tempo real.</span><button onClick={beginRecord} disabled={readOnly}><Circle fill="currentColor"/> Criar primeira faixa</button></div>}
      </main>
    </div>
    {status==='countin'&&<div className="vs-countin"><small>ENTRADA EM</small><strong>{((countBeat-1)%4)+1}</strong><div>{Array.from({length:4},(_,i)=><i key={i} className={i===((countBeat-1)%4)?'active':''}/>)}</div><span>Compasso {Math.ceil(countBeat/4)} de {countInBars}</span></div>}
  </div>;
}

function Wave({peaks}:{peaks:number[]}){const values=peaks.length?peaks:Array.from({length:80},()=>.04);return <svg className="vs-wave" viewBox={`0 0 ${values.length} 100`} preserveAspectRatio="none">{values.map((p,i)=><line key={i} x1={i+.5} x2={i+.5} y1={50-p*46} y2={50+p*46}/>)}</svg>;}
