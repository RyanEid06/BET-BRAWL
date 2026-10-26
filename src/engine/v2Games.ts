/** Pure, JSON-persistable authority for the eight V2 games. Times are absolute milliseconds. */
export const V2_GAME_IDS = ['memory_heist','crowd_count','mirror_trouble','safecracker','circuit_sprint','split_decision','treasure_tug','pocket_territory'] as const;
export type V2GameId = typeof V2_GAME_IDS[number];
export const V2_DURATIONS_SECONDS: Record<V2GameId, number> = {memory_heist:24,crowd_count:24,mirror_trouble:20,safecracker:30,circuit_sprint:30,split_decision:25,treasure_tug:24,pocket_territory:30};
export type V2Action =
  | {type:'MEMORY_DRAFT'; board:(number|null)[]; lock:boolean}
  | {type:'COUNT_GUESS'; value:number}
  | {type:'MIRROR_PICK'; choice:number}
  | {type:'CODE_GUESS'; symbols:number[]}
  | {type:'PIPE_ROTATE'; cell:number}
  | {type:'DUEL_COMMIT'; choice:'ATTACK'|'GUARD'|'CHARGE'}
  | {type:'TREASURE_COMMIT'; allocation:number[]}
  | {type:'TERRITORY_COMMIT'; cell:number|null};
export type DuelChoice = 'ATTACK'|'GUARD'|'CHARGE';
export type PipeKind = 'straight'|'elbow';
export interface CodeFeedback {exact:number; misplaced:number}
export interface CodeAttempt extends CodeFeedback {symbols:number[]}
export interface CountScene {objects:{target:boolean;x:number;y:number;rotation:number}[];count:number}
export interface MirrorPuzzle {target:number[];choices:number[][];correct:number}
export type V2Data =
  | {kind:'memory_heist';answer:(number|null)[];players:Record<string,{board:(number|null)[];locked:boolean}>}
  | {kind:'crowd_count';scenes:CountScene[];commits:Record<string,number>;outcomes:Record<string,unknown>[]}
  | {kind:'mirror_trouble';puzzles:MirrorPuzzle[];commits:Record<string,number>;outcomes:Record<string,unknown>[]}
  | {kind:'safecracker';secret:number[];players:Record<string,{history:CodeAttempt[];solved:boolean}>}
  | {kind:'circuit_sprint';pipeKinds:PipeKind[];initialRotations:number[];solutionRotations:number[];players:Record<string,{rotations:number[];moves:number;solved:boolean;powered:number[]}>}
  | {kind:'split_decision';players:Record<string,{hp:number;energy:number}>;commits:Record<string,DuelChoice>;outcomes:Record<string,unknown>[];knockout:boolean}
  | {kind:'treasure_tug';commits:Record<string,number[]>;outcomes:Record<string,unknown>[]}
  | {kind:'pocket_territory';board:(string|null)[];commits:Record<string,number|null>;outcomes:Record<string,unknown>[]};
export interface V2State {
  id:V2GameId;fighterIds:[string,string];startsAt:number;endsAt:number;stageIndex:number;phase:string;phaseEndsAt:number;
  finished:boolean;winnerId:string|null;scores:Record<string,number>;data:V2Data;
}
export interface V2View {config:Record<string,unknown>;state:Record<string,unknown>;scores:Record<string,number>}
const clone = <T>(value:T):T => JSON.parse(JSON.stringify(value));
const own = (record:object,key:string) => Object.prototype.hasOwnProperty.call(record,key);
const commitValue=<T>(record:Record<string,T>,key:string,fallback:T):T=>own(record,key)?record[key]:fallback;
function setCommit(record:object,key:string,value:unknown):void {Object.defineProperty(record,key,{value,writable:true,enumerable:true,configurable:true});}
const int = (n:unknown,min:number,max:number):n is number => typeof n==='number' && Number.isInteger(n) && n>=min && n<=max;
function randInt(random:()=>number,n:number):number {
  const value=random();
  return Math.max(0,Math.min(n-1,Math.floor((Number.isFinite(value)?value:0)*n)));
}
function shuffle<T>(values:T[],random:()=>number):T[]{const out=[...values];for(let i=out.length-1;i>0;i--){const j=randInt(random,i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
const pairRecord=<T>(ids:[string,string],value:(id:string)=>T):Record<string,T> => Object.fromEntries(ids.map(id=>[id,value(id)]));

export function codeFeedback(secret:number[],guess:number[]):CodeFeedback {
  let exact=0;const remaining:number[]=[];const other:number[]=[];
  secret.forEach((symbol,i)=>{if(symbol===guess[i])exact++;else {remaining.push(symbol);other.push(guess[i]);}});
  let misplaced=0; for(const symbol of other){const at=remaining.indexOf(symbol);if(at>=0){misplaced++;remaining.splice(at,1);}}
  return {exact,misplaced};
}

function rotateShape(shape:number[]):number[]{return shape.map(p=>(p%5)*5+4-Math.floor(p/5));}
function normalizeShape(shape:number[]):string {const xs=shape.map(p=>p%5),ys=shape.map(p=>Math.floor(p/5));const x=Math.min(...xs),y=Math.min(...ys);return shape.map(p=>(Math.floor(p/5)-y)*5+p%5-x).sort((a,b)=>a-b).join(',');}
export function shapeRotationKey(shape:number[]):string {const keys:string[]=[];let current=shape;for(let i=0;i<4;i++){keys.push(normalizeShape(current));current=rotateShape(current);}return keys.sort()[0];}
function mirrorShape(shape:number[]):number[]{return shape.map(p=>Math.floor(p/5)*5+4-p%5);}
function asymmetric(shape:number[]):boolean {const keys:string[]=[];let current=shape;for(let i=0;i<4;i++){keys.push(normalizeShape(current));current=rotateShape(current);}return new Set(keys).size===4 && shapeRotationKey(shape)!==shapeRotationKey(mirrorShape(shape));}
function makePuzzle(random:()=>number):MirrorPuzzle {
  const bases=[[0,5,10,15,16,17],[0,1,5,10,11,15],[0,5,6,10,15,16]].filter(asymmetric);
  const target=[...bases[randInt(random,bases.length)]];
  const wrongs=[mirrorShape(target),[0,1,2,5,10,15],[0,1,5,6,10,15],[0,5,10,11,16,17],[0,5,10,15,16,21]];
  const keys=[shapeRotationKey(target)];const choices:number[][]=[];
  for(const candidate of wrongs){const key=shapeRotationKey(candidate);if(!keys.includes(key)){keys.push(key);choices.push(candidate);}if(choices.length===3)break;}
  let correct=[...target];for(let i=0,n=randInt(random,4);i<n;i++)correct=rotateShape(correct);
  const correctIndex=randInt(random,4);choices.splice(correctIndex,0,correct);
  return {target,choices,correct:correctIndex};
}
function pipeMask(kind:PipeKind,rotation:number):number {let mask=kind==='straight'?5:3;for(let i=0;i<rotation;i++)mask=((mask<<1)&15)|(mask>>3);return mask;}
/** Ports N/E/S/W=1/2/4/8. External source at cell4 west; external sink at cell11 east. */
export function evaluateCircuit(kinds:PipeKind[],rotations:number[]):{powered:number[];solved:boolean} {
  if(!Array.isArray(kinds)||!Array.isArray(rotations)||kinds.length!==16||rotations.length!==16||!Array.from(kinds).every(k=>k==='straight'||k==='elbow')||!Array.from(rotations).every(r=>int(r,0,3)))return {powered:[],solved:false};
  const masks=kinds.map((kind,i)=>pipeMask(kind,rotations[i]));if(!(masks[4]&8))return {powered:[],solved:false};
  const powered=[4];for(let i=0;i<powered.length;i++){
    const cell=powered[i],row=Math.floor(cell/4),col=cell%4;
    const neighbors:[[number,number,number], [number,number,number], [number,number,number], [number,number,number]]=[[row>0?cell-4:-1,1,4],[col<3?cell+1:-1,2,8],[row<3?cell+4:-1,4,1],[col>0?cell-1:-1,8,2]];
    for(const [next,port,opposite] of neighbors)if(next>=0&&(masks[cell]&port)&&(masks[next]&opposite)&&!powered.includes(next))powered.push(next);
  }
  return {powered:powered.sort((a,b)=>a-b),solved:powered.includes(11)&&!!(masks[11]&2)};
}
function makeCircuit(ids:[string,string],random:()=>number):Extract<V2Data,{kind:'circuit_sprint'}> {
  const pipeKinds:PipeKind[]=Array.from({length:16},()=>randInt(random,2)?'elbow':'straight');
  const solutionRotations=Array.from({length:16},()=>randInt(random,4));
  const path=[4];
  const findRoute=(cell:number):boolean=>{
    if(cell===11)return true;
    const neighbors=[cell>=4?cell-4:-1,cell%4<3?cell+1:-1,cell<12?cell+4:-1,cell%4>0?cell-1:-1];
    for(const next of shuffle(neighbors.filter(n=>n>=0&&!path.includes(n)),random)){
      path.push(next);if(findRoute(next))return true;path.pop();
    }
    return false;
  };
  findRoute(4);
  const port=(from:number,to:number)=>to===from-4?1:to===from+1?2:to===from+4?4:8;
  path.forEach((cell,i)=>{
    const mask=(i===0?8:port(cell,path[i-1]))|(i===path.length-1?2:port(cell,path[i+1]));
    const kind:PipeKind=mask===5||mask===10?'straight':'elbow';pipeKinds[cell]=kind;
    solutionRotations[cell]=[0,1,2,3].find(r=>pipeMask(kind,r)===mask)!;
  });
  const initialRotations=Array.from({length:16},()=>randInt(random,4));
  // Closing both external ports guarantees that at least two different tiles must turn.
  for(const [cell,external] of [[4,8],[11,2]]){
    const closed=[0,1,2,3].filter(r=>!(pipeMask(pipeKinds[cell],r)&external));
    initialRotations[cell]=closed[randInt(random,closed.length)];
  }
  return {kind:'circuit_sprint',pipeKinds,initialRotations,solutionRotations,players:pairRecord(ids,()=>({rotations:[...initialRotations],moves:0,solved:false,powered:[]}))};
}
export function initV2Game(id:V2GameId,fighterIds:[string,string],startsAt:number,random:()=>number=Math.random):V2State {
  if(!V2_GAME_IDS.includes(id)||!Array.isArray(fighterIds)||fighterIds.length!==2||fighterIds.some(x=>typeof x!=='string'||!x)||fighterIds[0]===fighterIds[1]||!Number.isFinite(startsAt))throw new Error('Invalid V2 game initialization');
  const ids:[string,string]=[...fighterIds];let data:V2Data;
  switch(id){
    case 'memory_heist':data={kind:id,answer:shuffle([...Array.from({length:6},(_,i)=>i),null,null,null],random),players:pairRecord(ids,()=>({board:Array(9).fill(null),locked:false}))};break;
    case 'crowd_count':data={kind:id,scenes:Array.from({length:3},()=>{const count=6+randInt(random,19);return {count,objects:shuffle(Array.from({length:36},(_,i)=>({target:i<count,x:(i%6+.15+randInt(random,40)/100)/6,y:(Math.floor(i/6)+.15+randInt(random,40)/100)/6,rotation:randInt(random,360)})),random)};}),commits:{},outcomes:[]};break;
    case 'mirror_trouble':data={kind:id,puzzles:Array.from({length:5},()=>makePuzzle(random)),commits:{},outcomes:[]};break;
    case 'safecracker':data={kind:id,secret:Array.from({length:3},()=>randInt(random,5)),players:pairRecord(ids,()=>({history:[],solved:false}))};break;
    case 'circuit_sprint':data=makeCircuit(ids,random);break;
    case 'split_decision':data={kind:id,players:pairRecord(ids,()=>({hp:3,energy:1})),commits:{},outcomes:[],knockout:false};break;
    case 'treasure_tug':data={kind:id,commits:{},outcomes:[]};break;
    case 'pocket_territory':{const board:(string|null)[]=Array(25).fill(null);board[0]=ids[0];board[24]=ids[1];data={kind:id,board,commits:{},outcomes:[]};break;}
  }
  return {id,fighterIds:ids,startsAt,endsAt:startsAt+V2_DURATIONS_SECONDS[id]*1000,stageIndex:0,phase:'waiting',phaseEndsAt:startsAt,finished:false,winnerId:null,scores:pairRecord(ids,()=>0),data};
}
const territoryWeight=(cell:number)=>cell===12?5:[7,11,13,17].includes(cell)?3:1;
export function territoryLegalCells(board:(string|null)[],fighterId:string):number[]{return board.flatMap((owner,cell)=>owner===null&&[cell%5>0?cell-1:-1,cell%5<4?cell+1:-1,cell>=5?cell-5:-1,cell<20?cell+5:-1].some(n=>n>=0&&board[n]===fighterId)?[cell]:[]);}
function finish(state:V2State,at:number):void {
  if(state.finished)return;
  const d=state.data,[a,b]=state.fighterIds;
  if(d.kind==='memory_heist')for(const id of state.fighterIds)state.scores[id]=d.players[id].board.reduce<number>((sum,symbol,i)=>sum+(symbol!==null&&symbol===d.answer[i]?1:0),0);
  if(d.kind==='safecracker')for(const id of state.fighterIds){const p=d.players[id];state.scores[id]=p.solved?100-p.history.length:p.history.length?Math.max(...p.history.map(h=>h.exact*4+h.misplaced)):-1;}
  if(d.kind==='circuit_sprint')for(const id of state.fighterIds){const p=d.players[id];const result=evaluateCircuit(d.pipeKinds,p.rotations);p.powered=result.powered;p.solved=result.solved;state.scores[id]=p.solved?1000000-p.moves:p.powered.length;}
  if(d.kind==='split_decision')for(const id of state.fighterIds)state.scores[id]=d.players[id].hp*4+d.players[id].energy;
  if(d.kind==='pocket_territory')for(const id of state.fighterIds)state.scores[id]=d.board.reduce((sum,owner,cell)=>sum+(owner===id?territoryWeight(cell):0),0);
  let comparison=state.scores[a]-state.scores[b];
  if(d.kind==='crowd_count')comparison=-comparison;
  if(d.kind==='circuit_sprint'){const pa=d.players[a],pb=d.players[b];comparison=pa.solved!==pb.solved?(pa.solved?1:-1):pa.solved?pb.moves-pa.moves:pa.powered.length-pb.powered.length;}
  if(d.kind==='split_decision'&&(d.players[a].hp===0||d.players[b].hp===0))comparison=d.players[a].hp-d.players[b].hp;
  state.winnerId=comparison===0?null:comparison>0?a:b;state.finished=true;state.phase='finished';state.phaseEndsAt=at;
}
function resolveStage(state:V2State):void {
  const d=state.data,[a,b]=state.fighterIds;const outcome:Record<string,unknown>={stageIndex:state.stageIndex};
  if(d.kind==='crowd_count'){
    const count=d.scenes[state.stageIndex].count;const guesses=pairRecord(state.fighterIds,id=>own(d.commits,id)?d.commits[id]:null);
    for(const id of state.fighterIds)state.scores[id]+=guesses[id]===null?37:Math.abs(guesses[id]-count);
    Object.assign(outcome,{count,guesses});
  }else if(d.kind==='mirror_trouble'){
    const correct=d.puzzles[state.stageIndex].correct;const choices=pairRecord(state.fighterIds,id=>own(d.commits,id)?d.commits[id]:null);
    for(const id of state.fighterIds)state.scores[id]+=choices[id]===correct?1:0;
    Object.assign(outcome,{correct,choices});
  }else if(d.kind==='split_decision'){
    const choices=pairRecord(state.fighterIds,id=>commitValue(d.commits,id,'GUARD'));
    for(const id of state.fighterIds){if(choices[id]==='ATTACK')d.players[id].energy--;if(choices[id]==='CHARGE')d.players[id].energy=Math.min(3,d.players[id].energy+1);}
    for(const [id,other] of [[a,b],[b,a]])if(choices[other]==='ATTACK'&&choices[id]!=='GUARD')d.players[id].hp=Math.max(0,d.players[id].hp-1);
    d.knockout=state.fighterIds.some(id=>d.players[id].hp===0);Object.assign(outcome,{choices,players:clone(d.players)});
  }else if(d.kind==='treasure_tug'){
    const allocations=pairRecord(state.fighterIds,id=>commitValue(d.commits,id,[0,0,0]));const points=pairRecord(state.fighterIds,()=>0);
    for(let lane=0;lane<3;lane++){if(allocations[a][lane]>allocations[b][lane])points[a]+=lane+1;else if(allocations[b][lane]>allocations[a][lane])points[b]+=lane+1;}
    for(const id of state.fighterIds)state.scores[id]+=points[id];Object.assign(outcome,{allocations,points});
  }else if(d.kind==='pocket_territory'){
    const cells=pairRecord(state.fighterIds,id=>commitValue(d.commits,id,null));
    if(cells[a]!==null&&cells[a]===cells[b])d.board[cells[a]]='blocked';else for(const id of state.fighterIds)if(cells[id]!==null)d.board[cells[id]]=id;
    for(const id of state.fighterIds)state.scores[id]=d.board.reduce((sum,owner,cell)=>sum+(owner===id?territoryWeight(cell):0),0);
    Object.assign(outcome,{cells,board:[...d.board]});
  }else return;
  d.outcomes.push(outcome);d.commits={};
}
function beginStage(state:V2State,at:number):void {
  if(state.id==='crowd_count'){state.phase='view';state.phaseEndsAt=at+2000;}
  else if(state.id==='mirror_trouble'){state.phase='puzzle';state.phaseEndsAt=at+4000;}
  else {state.phase='commit';state.phaseEndsAt=at+(state.id==='treasure_tug'?7000:4000);}
}
export function advanceV2Game(state:V2State,nowMs:number):void {
  if(!Number.isFinite(nowMs))return;
  while(!state.finished&&state.phaseEndsAt<=nowMs){
    const at=state.phaseEndsAt;
    if(state.phase==='waiting'){
      if(state.id==='memory_heist'){state.phase='study';state.phaseEndsAt=at+4000;}
      else if(state.id==='safecracker'||state.id==='circuit_sprint'){state.phase='play';state.phaseEndsAt=state.endsAt;}
      else beginStage(state,at);
    }else if(state.id==='memory_heist'&&state.phase==='study'){state.phase='draft';state.phaseEndsAt=state.endsAt;}
    else if(['memory_heist','safecracker','circuit_sprint'].includes(state.id)){finish(state,at);}
    else if(state.id==='crowd_count'&&state.phase==='view'){state.phase='answer';state.phaseEndsAt=at+5000;}
    else if(state.phase==='reveal'){
      const d=state.data;const rounds=state.id==='split_decision'?5:state.id==='pocket_territory'?6:3;
      if(state.stageIndex+1>=rounds||(d.kind==='split_decision'&&d.knockout))finish(state,at);
      else {state.stageIndex++;beginStage(state,at);}
    }else {
      resolveStage(state);
      if(state.id==='mirror_trouble'){if(state.stageIndex===4)finish(state,at);else {state.stageIndex++;beginStage(state,at);}}
      else {state.phase='reveal';state.phaseEndsAt=at+1000;}
    }
  }
}
export function v2NextDeadline(state:V2State):number|null {return state.finished?null:state.phaseEndsAt;}
const actionType:Record<V2GameId,V2Action['type']>={memory_heist:'MEMORY_DRAFT',crowd_count:'COUNT_GUESS',mirror_trouble:'MIRROR_PICK',safecracker:'CODE_GUESS',circuit_sprint:'PIPE_ROTATE',split_decision:'DUEL_COMMIT',treasure_tug:'TREASURE_COMMIT',pocket_territory:'TERRITORY_COMMIT'};
export function processV2Action(state:V2State,fighterId:string,action:V2Action,nowMs:number):{accepted:boolean;reason?:string} {
  advanceV2Game(state,nowMs);
  const reject=(reason:string)=>({accepted:false,reason});
  if(!Number.isFinite(nowMs)||!state.fighterIds.includes(fighterId))return reject('Invalid actor or time');
  if(state.finished||nowMs<state.startsAt||nowMs>=state.endsAt||['waiting','study','view','reveal'].includes(state.phase))return reject('Not accepting actions');
  if(!action||typeof action!=='object'||Array.isArray(action)||action.type!==actionType[state.id])return reject('Wrong action');
  const d=state.data;
  switch(d.kind){
    case 'memory_heist':{
      if(action.type!=='MEMORY_DRAFT')return reject('Wrong action');const p=d.players[fighterId],board=action.board;
      if(p.locked)return reject('Locked');
      if(typeof action.lock!=='boolean'||!Array.isArray(board)||board.length!==9||!Array.from(board).every(x=>x===null||int(x,0,5)))return reject('Invalid board');
      const symbols=board.filter(x=>x!==null);if(new Set(symbols).size!==symbols.length)return reject('Duplicate symbol');
      p.board=[...board];p.locked=action.lock;if(state.fighterIds.every(id=>d.players[id].locked))finish(state,nowMs);break;
    }
    case 'crowd_count':if(action.type!=='COUNT_GUESS'||!int(action.value,0,36))return reject('Invalid estimate');else {if(own(d.commits,fighterId))return reject('Locked');setCommit(d.commits,fighterId,action.value);}break;
    case 'mirror_trouble':if(action.type!=='MIRROR_PICK'||!int(action.choice,0,3))return reject('Invalid choice');else {if(own(d.commits,fighterId))return reject('Locked');setCommit(d.commits,fighterId,action.choice);}break;
    case 'safecracker':{
      if(action.type!=='CODE_GUESS'||!Array.isArray(action.symbols)||action.symbols.length!==3||!Array.from(action.symbols).every(x=>int(x,0,4)))return reject('Invalid code');
      const p=d.players[fighterId];if(p.solved||p.history.length>=5)return reject('Finished attempts');
      const feedback=codeFeedback(d.secret,action.symbols);p.history.push({symbols:[...action.symbols],...feedback});p.solved=feedback.exact===3;
      if(state.fighterIds.every(id=>d.players[id].solved||d.players[id].history.length>=5))finish(state,nowMs);break;
    }
    case 'circuit_sprint':{
      if(action.type!=='PIPE_ROTATE'||!int(action.cell,0,15))return reject('Invalid cell');const p=d.players[fighterId];if(p.solved)return reject('Board locked');
      p.rotations[action.cell]=(p.rotations[action.cell]+1)%4;p.moves++;const result=evaluateCircuit(d.pipeKinds,p.rotations);p.powered=result.powered;p.solved=result.solved;
      if(state.fighterIds.every(id=>d.players[id].solved))finish(state,nowMs);break;
    }
    case 'split_decision':{
      if(action.type!=='DUEL_COMMIT'||!['ATTACK','GUARD','CHARGE'].includes(action.choice))return reject('Invalid choice');
      if(own(d.commits,fighterId))return reject('Locked');if(action.choice==='ATTACK'&&d.players[fighterId].energy<1)return reject('No energy');setCommit(d.commits,fighterId,action.choice);break;
    }
    case 'treasure_tug':{
      if(action.type!=='TREASURE_COMMIT'||!Array.isArray(action.allocation)||action.allocation.length!==3||!Array.from(action.allocation).every(x=>int(x,0,10))||action.allocation.reduce((a,b)=>a+b,0)!==10)return reject('Invalid allocation');
      if(own(d.commits,fighterId))return reject('Locked');setCommit(d.commits,fighterId,[...action.allocation]);break;
    }
    case 'pocket_territory':{
      if(action.type!=='TERRITORY_COMMIT'||(action.cell!==null&&(!int(action.cell,0,24)||!territoryLegalCells(d.board,fighterId).includes(action.cell))))return reject('Illegal claim');
      if(own(d.commits,fighterId))return reject('Locked');setCommit(d.commits,fighterId,action.cell);break;
    }
  }
  return {accepted:true};
}

/** Every field is explicitly allowlisted. A detached clone also prevents UI mutation of authority. */
export function projectV2Game(authority:V2State,viewerId:string|null,nowMs:number,reveal=false):V2View {
  const s=clone(authority);advanceV2Game(s,nowMs);const d=s.data;const owner=viewerId!==null&&s.fighterIds.includes(viewerId)?viewerId:null;
  const config:Record<string,unknown>={gameId:s.id};const state:Record<string,unknown>={stageIndex:s.stageIndex,phase:s.phase,phaseEndsAt:s.phaseEndsAt,finished:s.finished};
  const scores=pairRecord(s.fighterIds,()=>0);if(s.phase==='waiting')return {config,state,scores};
  const done=s.finished;const commitGame='commits' in d;
  if(done||commitGame)Object.assign(scores,s.scores);
  if(owner&&commitGame)state.mine={locked:own(d.commits,owner),...(own(d.commits,owner)?{commit:clone(d.commits[owner])}:{})};
  switch(d.kind){
    case 'memory_heist':
      Object.assign(config,{size:3,symbols:[0,1,2,3,4,5]});if(s.phase==='study'||done)config.board=[...d.answer];
      if(owner)state.mine=clone(d.players[owner]);break;
    case 'crowd_count':
      Object.assign(config,{totalObjects:36,minGuess:0,maxGuess:36,targetLabel:'gold'});if(s.phase==='view')config.objects=clone(d.scenes[s.stageIndex].objects);break;
    case 'mirror_trouble':
      Object.assign(config,{gridSize:5,target:clone(d.puzzles[s.stageIndex].target),choices:clone(d.puzzles[s.stageIndex].choices)});break;
    case 'safecracker':
      Object.assign(config,{symbolCount:5,codeLength:3,maxGuesses:5});if(owner)state.mine=clone(d.players[owner]);break;
    case 'circuit_sprint':
      Object.assign(config,{size:4,pipeKinds:[...d.pipeKinds],initialRotations:[...d.initialRotations],sourceCell:4,sinkCell:11});if(owner)state.mine=clone(d.players[owner]);break;
    case 'split_decision':
      Object.assign(config,{choices:['ATTACK','GUARD','CHARGE'],energyCap:3});state.players=clone(d.players);break;
    case 'treasure_tug':Object.assign(config,{laneValues:[1,2,3],energy:10});break;
    case 'pocket_territory':
      Object.assign(config,{size:5,weights:Array.from({length:25},(_,i)=>territoryWeight(i))});state.board=[...d.board];if(owner)Object.assign(state.mine as object,{legalCells:territoryLegalCells(d.board,owner)});break;
  }
  if('outcomes' in d&&d.outcomes.length)state.outcome=clone(d.outcomes[d.outcomes.length-1]);
  // Explicit reveal is a recap hint, never permission to disclose unresolved commitments.
  if(done){state.winnerId=s.winnerId;state.recap=clone(d);if(reveal)state.revealed=true;}
  return {config,state,scores};
}

/** Modest bot: only its own view and currently visible stimuli, never authoritative data. */
export function getV2BotAction(view:V2View,random:()=>number=Math.random):V2Action|null {
  const c=view.config,s=view.state,m=(s.mine??{}) as Record<string,any>;if(!s.mine||s.finished||m.locked||['waiting','study','view','reveal'].includes(String(s.phase)))return null;
  switch(c.gameId as V2GameId){
    case 'memory_heist':return {type:'MEMORY_DRAFT',board:shuffle([0,1,2,3,4,5,null,null,null],random),lock:true};
    case 'crowd_count':return {type:'COUNT_GUESS',value:6+randInt(random,19)};
    case 'mirror_trouble':{
      const target=c.target as number[],choices=c.choices as number[][];return {type:'MIRROR_PICK',choice:random()<.55?choices.findIndex(x=>shapeRotationKey(x)===shapeRotationKey(target)):randInt(random,4)};
    }
    case 'safecracker':if(m.solved||(m.history?.length??0)>=5)return null;return {type:'CODE_GUESS',symbols:Array.from({length:3},()=>randInt(random,5))};
    case 'circuit_sprint':if(m.solved)return null;return {type:'PIPE_ROTATE',cell:randInt(random,16)};
    case 'split_decision':{
      const players=s.players as Record<string,{energy:number}>;const ownEnergy=typeof m.energy==='number'?m.energy:Math.min(...Object.values(players).map(p=>p.energy));
      const choices:DuelChoice[]=ownEnergy>0?['ATTACK','GUARD','CHARGE']:['GUARD','CHARGE'];return {type:'DUEL_COMMIT',choice:choices[randInt(random,choices.length)]};
    }
    case 'treasure_tug':{const a=randInt(random,11),b=randInt(random,11-a);return {type:'TREASURE_COMMIT',allocation:[a,b,10-a-b]};}
    case 'pocket_territory':{const legal=m.legalCells as number[]??[];return {type:'TERRITORY_COMMIT',cell:legal.length?legal[randInt(random,legal.length)]:null};}
    default:return null;
  }
}
