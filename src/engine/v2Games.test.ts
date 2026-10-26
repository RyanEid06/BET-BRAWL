import test from 'node:test';
import assert from 'node:assert/strict';
import { V2_GAME_IDS, V2_DURATIONS_SECONDS, initV2Game, advanceV2Game, processV2Action, projectV2Game, v2NextDeadline, getV2BotAction, codeFeedback, evaluateCircuit, shapeRotationKey, territoryLegalCells } from './v2Games';
const start = 1000;
const make = (id: typeof V2_GAME_IDS[number]) => initV2Game(id, ['a', 'b'], start, () => .31);
const act = (s: any, who: string, action: any, t = start) => processV2Action(s, who, action, t);
const roundtrip = (s: any) => JSON.parse(JSON.stringify(s));

test('every game survives persistence, catches up once, and withholds prestart stimuli', () => {
  for (const id of V2_GAME_IDS) {
    let s = make(id);
    assert.equal(v2NextDeadline(s), start);
    assert.deepEqual(projectV2Game(s, null, start - 1).config, {gameId: id});
    s = roundtrip(s);
    advanceV2Game(s, start + V2_DURATIONS_SECONDS[id] * 1000 + 5000);
    assert.equal(s.finished, true, id);
    assert.equal(s.winnerId, null, id);
    const done = JSON.stringify(s);
    advanceV2Game(s, start + 100000);
    assert.equal(JSON.stringify(s), done);
    assert.equal(v2NextDeadline(s), null);
  }
});

test('memory validates atomic snapshots without locking on rejection and hides correctness', () => {
  const s = make('memory_heist');
  assert.equal(act(s, 'a', {type:'MEMORY_DRAFT', board:Array(9).fill(null), lock:true}).accepted, false);
  advanceV2Game(s, start + 4000);
  const board = s.data.kind === 'memory_heist' ? s.data.answer : [];
  for (const bad of [null, [], [0,0,...Array(7).fill(null)], Array(9).fill(NaN)]) {
    assert.equal(act(s, 'a', {type:'MEMORY_DRAFT',board:bad,lock:true}, start+4000).accepted,false);
  }
  assert.equal(act(s, 'a', {type:'MEMORY_DRAFT',board,lock:true}, start+4000).accepted,true);
  assert.deepEqual(projectV2Game(s,'b',start+4000).scores,{a:0,b:0});
  assert.equal(JSON.stringify(projectV2Game(s,null,start+4000)).includes('answer'), false);
  assert.equal(act(s, 'b', {type:'MEMORY_DRAFT',board:Array(9).fill(null),lock:true}, start+4000).accepted,true);
  assert.equal(s.winnerId,'a');
  assert.equal(s.scores.a,6);
});

test('count hides exact and future scenes, resolves on deadline, and missing costs 37', () => {
  const s = make('crowd_count');
  advanceV2Game(s,start);
  assert.equal(act(s,'a',{type:'COUNT_GUESS',value:10}).accepted,false);
  advanceV2Game(s,start+2000);
  const correct = s.data.kind==='crowd_count' ? s.data.scenes[0].count : -1;
  assert.equal(act(s,'a',{type:'COUNT_GUESS',value:NaN},start+2000).accepted,false);
  assert.equal(act(s,'a',{type:'COUNT_GUESS',value:correct},start+2000).accepted,true);
  assert.equal(act(s,'a',{type:'COUNT_GUESS',value:correct},start+2000).accepted,false);
  assert.equal(s.scores.b,0);
  assert.equal(projectV2Game(s,'b',start+2000).state.outcome,undefined);
  advanceV2Game(s,start+7000);
  assert.equal(s.scores.b,37);
  assert.equal(s.stageIndex,0);
  advanceV2Game(s,start+24000);
  assert.equal(s.scores.a,74);
  assert.equal(s.scores.b,111);
  assert.equal(s.winnerId,'a');
});

test('mirror puzzles have one rotation-equivalent answer and deadline-only reveal', () => {
  const s=make('mirror_trouble'); advanceV2Game(s,start);
  if(s.data.kind!=='mirror_trouble') throw Error();
  assert.equal(s.data.puzzles.length,5);
  const correct=s.data.puzzles[0].correct;
  assert.equal(act(s,'a',{type:'MIRROR_PICK',choice:correct}).accepted,true);
  assert.equal(act(s,'b',{type:'MIRROR_PICK',choice:correct}).accepted,true);
  assert.equal(s.stageIndex,0);
  assert.deepEqual(projectV2Game(s,null,start).scores,{a:0,b:0});
  advanceV2Game(s,start+4000);
  assert.equal(s.stageIndex,1); assert.equal(s.scores.a,1);
});

test('safecracker uses duplicate-aware feedback and attempt-based victory with private history', () => {
  assert.deepEqual(codeFeedback([1,1,2],[1,2,1]),{exact:1,misplaced:2});
  const s=make('safecracker'); advanceV2Game(s,start);
  if(s.data.kind!=='safecracker') throw Error();
  const secret=s.data.secret;
  assert.equal(act(s,'a',{type:'CODE_GUESS',symbols:[1,2]}).accepted,false);
  assert.equal(act(s,'a',{type:'CODE_GUESS',symbols:secret}).accepted,true);
  assert.equal(JSON.stringify(projectV2Game(s,'b',start)).includes('history'),true);
  assert.deepEqual((projectV2Game(s,'b',start).state.mine as any).history,[]);
  assert.equal(act(s,'b',{type:'CODE_GUESS',symbols:secret.map(x=>(x+1)%5)}).accepted,true);
  assert.equal(act(s,'b',{type:'CODE_GUESS',symbols:secret}).accepted,true);
  assert.equal(s.finished,true); assert.equal(s.winnerId,'a');
});

test('circuit requires reciprocal source-powered path and counts undo moves', () => {
  assert.deepEqual(evaluateCircuit(Array(16).fill('straight'),Array(16).fill(0)),{powered:[],solved:false});
  const s=make('circuit_sprint'); advanceV2Game(s,start);
  if(s.data.kind!=='circuit_sprint') throw Error();
  assert.equal(evaluateCircuit(s.data.pipeKinds,s.data.initialRotations).solved,false);
  assert.equal(evaluateCircuit(s.data.pipeKinds,s.data.solutionRotations).solved,true);
  assert.equal(act(s,'a',{type:'PIPE_ROTATE',cell:NaN}).accepted,false);
  assert.equal(act(s,'a',{type:'PIPE_ROTATE',cell:0}).accepted,true);
  assert.equal(s.data.players.a.moves,1);
  for(let i=0;i<3;i++) act(s,'a',{type:'PIPE_ROTATE',cell:0});
  assert.equal(s.data.players.a.moves,4);
  assert.deepEqual(s.data.players.a.rotations,s.data.initialRotations);
  assert.deepEqual(projectV2Game(s,'b',start).scores,{a:0,b:0});
});

test('duel resolves simultaneously, rejects invalid attack without locking, and grants charge when hit', () => {
  const s=make('split_decision');
  act(s,'a',{type:'DUEL_COMMIT',choice:'ATTACK'}); act(s,'b',{type:'DUEL_COMMIT',choice:'CHARGE'});
  advanceV2Game(s,start+4000);
  if(s.data.kind!=='split_decision') throw Error();
  assert.deepEqual(s.data.players.a,{hp:3,energy:0}); assert.deepEqual(s.data.players.b,{hp:2,energy:2});
  advanceV2Game(s,start+5000);
  assert.equal(act(s,'a',{type:'DUEL_COMMIT',choice:'ATTACK'},start+5000).accepted,false);
  assert.equal(act(s,'a',{type:'DUEL_COMMIT',choice:'CHARGE'},start+5000).accepted,true);
  advanceV2Game(s,start+25000); assert.equal(s.winnerId,'a');
});

test('treasure validates allocation, hides commits and applies missing zeros on every skirmish', () => {
  const s=make('treasure_tug');
  assert.equal(act(s,'a',{type:'TREASURE_COMMIT',allocation:[3,3,3]}).accepted,false);
  assert.equal(act(s,'a',{type:'TREASURE_COMMIT',allocation:[1,2,7]}).accepted,true);
  assert.equal(projectV2Game(s,'b',start).state.outcome,undefined);
  assert.deepEqual(projectV2Game(s,null,start).scores,{a:0,b:0});
  advanceV2Game(s,start+7000); assert.equal(s.scores.a,6);
  advanceV2Game(s,start+24000); assert.equal(s.winnerId,'a');
});

test('territory claims use turn-start legality and same-cell collision blocks permanently', () => {
  const s=make('pocket_territory'); advanceV2Game(s,start);
  if(s.data.kind!=='pocket_territory') throw Error();
  s.data.board=Array(25).fill(null); s.data.board[11]='a';s.data.board[13]='b';
  assert.equal(act(s,'a',{type:'TERRITORY_COMMIT',cell:12}).accepted,true);
  assert.equal(act(s,'b',{type:'TERRITORY_COMMIT',cell:12}).accepted,true);
  advanceV2Game(s,start+4000); assert.equal(s.data.board[12],'blocked');
  advanceV2Game(s,start+5000);
  assert.equal(act(s,'a',{type:'TERRITORY_COMMIT',cell:12},start+5000).accepted,false);
  assert.equal(act(s,'a',{type:'TERRITORY_COMMIT',cell:null},start+5000).accepted,true);
});

test('all actions enforce identity, phase, deadline and malformed runtime boundaries', () => {
  for(const id of V2_GAME_IDS){
    const s=make(id); const before=JSON.stringify(s);
    assert.equal(act(s,'outsider',null,start-1).accepted,false); assert.equal(JSON.stringify(s),before);
    for(const bad of [null,undefined,[],{}, {type:'NOPE'}, {type:'COUNT_GUESS',value:Infinity}]) assert.equal(act(s,'a',bad).accepted,false);
    advanceV2Game(s,s.endsAt);
    assert.equal(act(s,'a',{type:'TERRITORY_COMMIT',cell:null},s.endsAt).accepted,false);
  }
});

test('projections are detached and bot uses only legal owner-visible content',()=>{
  for(const id of V2_GAME_IDS){
    const s=make(id); const now=start+(id==='memory_heist'?4000:id==='crowd_count'?2000:0);
    advanceV2Game(s,now); const before=JSON.stringify(s); const view=projectV2Game(s,'a',now);
    assert.equal(JSON.stringify(s),before); const action=getV2BotAction(view,()=>.2);
    assert.ok(action,id); assert.equal(act(s,'a',action,now).accepted,true,id);
    if(view.state.mine) (view.state.mine as any).locked=true;
    const spectator=projectV2Game(s,null,now); assert.equal(spectator.state.mine,undefined);
  }
});

test('mirror generation excludes chirality/rotation ambiguity across seeds',()=>{
  for(let seed=1;seed<=80;seed++){
    let n=seed;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296);
    const s=initV2Game('mirror_trouble',['a','b'],0,random);
    if(s.data.kind!=='mirror_trouble')throw Error();
    for(const p of s.data.puzzles){
      const key=shapeRotationKey(p.target);
      assert.equal(p.choices.filter(choice=>shapeRotationKey(choice)===key).length,1);
      assert.equal(shapeRotationKey(p.choices[p.correct]),key);
      assert.notEqual(shapeRotationKey(p.target.map(cell=>Math.floor(cell/5)*5+4-cell%5)),key);
    }
  }
});

test('circuit generators force multiple rotations and retain a solution after JSON restore',()=>{
  const routes = new Set<string>();
  for(let seed=0;seed<60;seed++){
    let n=seed;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296);
    const s=roundtrip(initV2Game('circuit_sprint',['a','b'],0,random));const d=s.data;
    assert.equal(evaluateCircuit(d.pipeKinds,d.solutionRotations).solved,true);
    routes.add(evaluateCircuit(d.pipeKinds,d.solutionRotations).powered.join(','));
    assert.equal(evaluateCircuit(d.pipeKinds,d.initialRotations).solved,false);
    for(let cell=0;cell<16;cell++){const rotations=[...d.initialRotations];rotations[cell]=(rotations[cell]+1)%4;assert.equal(evaluateCircuit(d.pipeKinds,rotations).solved,false);}
  }
  assert.ok(routes.size > 10, 'winning routes must vary across puzzles');
});

test('secret actions stay immutable and private until scheduled reveal, including after restore',()=>{
  for(const id of ['crowd_count','mirror_trouble','split_decision','treasure_tug','pocket_territory'] as const){
    let s=make(id);const t=start+(id==='crowd_count'?2000:0);advanceV2Game(s,t);
    const view=projectV2Game(s,'a',t);const action=getV2BotAction(view,()=>.1)!;
    assert.equal(act(s,'a',action,t).accepted,true);
    const mine=(projectV2Game(s,'a',t).state.mine as any).commit;
    s=roundtrip(s);
    assert.equal(act(s,'a',action,t).accepted,false);
    assert.deepEqual((projectV2Game(s,'a',t).state.mine as any).commit,mine);
    const other=projectV2Game(s,'b',t,true),spectator=projectV2Game(s,null,t,true);
    assert.equal(other.state.outcome,undefined);assert.equal(spectator.state.recap,undefined);
    assert.equal((other.state.mine as any).commit,undefined);
    assert.equal(spectator.state.mine,undefined);
  }
});

test('late catch-up matches incremental phase processing for every repeated game',()=>{
  for(const id of V2_GAME_IDS){
    const incremental=make(id),late=roundtrip(incremental);
    for(let t=start;t<=incremental.endsAt;t+=1000)advanceV2Game(incremental,t);
    advanceV2Game(late,late.endsAt+100000);
    assert.deepEqual(late,incremental,id);
  }
});

test('safecracker compares unsolved best guesses lexicographically and no guess ranks last',()=>{
  const s=make('safecracker');if(s.data.kind!=='safecracker')throw Error();s.data.secret=[0,1,2];
  act(s,'a',{type:'CODE_GUESS',symbols:[0,4,4]}); // 1 exact, 0 misplaced
  act(s,'b',{type:'CODE_GUESS',symbols:[1,2,0]}); // 0 exact, 3 misplaced
  advanceV2Game(s,s.endsAt);assert.equal(s.winnerId,'a');
  const t=make('safecracker');if(t.data.kind!=='safecracker')throw Error();t.data.secret=[0,1,2];
  act(t,'b',{type:'CODE_GUESS',symbols:[4,4,4]});advanceV2Game(t,t.endsAt);assert.equal(t.winnerId,'b');
});

test('safecracker locks after five guesses and independent ties never use speed',()=>{
  const s=make('safecracker');if(s.data.kind!=='safecracker')throw Error();s.data.secret=[0,1,2];
  for(let n=0;n<5;n++)assert.equal(act(s,'a',{type:'CODE_GUESS',symbols:[4,4,4]}).accepted,true);
  assert.equal(act(s,'a',{type:'CODE_GUESS',symbols:[0,1,2]}).accepted,false);
  for(let n=0;n<5;n++)act(s,'b',{type:'CODE_GUESS',symbols:[4,4,4]},start+1000);
  assert.equal(s.finished,true);assert.equal(s.winnerId,null);
});

test('duel simultaneous knockout is a tie even with unequal energy and keeps final reveal',()=>{
  const s=make('split_decision');advanceV2Game(s,start);if(s.data.kind!=='split_decision')throw Error();
  s.data.players.a={hp:1,energy:1};s.data.players.b={hp:1,energy:3};
  act(s,'a',{type:'DUEL_COMMIT',choice:'ATTACK'});act(s,'b',{type:'DUEL_COMMIT',choice:'ATTACK'});
  advanceV2Game(s,start+4000);assert.equal(s.finished,false);assert.equal(s.phase,'reveal');
  advanceV2Game(s,start+5000);assert.equal(s.finished,true);assert.equal(s.winnerId,null);
});

test('territory scores starts and weighted centers with independent simultaneous claims',()=>{
  const s=make('pocket_territory');advanceV2Game(s,start);if(s.data.kind!=='pocket_territory')throw Error();
  assert.deepEqual(territoryLegalCells(s.data.board,'a'),[1,5]);
  assert.equal(act(s,'a',{type:'TERRITORY_COMMIT',cell:6}).accepted,false);
  act(s,'a',{type:'TERRITORY_COMMIT',cell:1});act(s,'b',{type:'TERRITORY_COMMIT',cell:23});
  advanceV2Game(s,start+4000);assert.equal(s.data.board[1],'a');assert.equal(s.data.board[23],'b');
  s.data.board[12]='a';s.data.board[7]='a';advanceV2Game(s,s.endsAt);
  assert.equal(s.scores.a,10);assert.equal(s.scores.b,2);
});

test('adversarial sparse, noninteger and nonfinite arrays cannot lock valid subsequent actions',()=>{
  for(const id of ['memory_heist','safecracker','treasure_tug'] as const){
    const s=make(id),now=id==='memory_heist'?start+4000:start;advanceV2Game(s,now);
    const field=id==='memory_heist'?'board':id==='safecracker'?'symbols':'allocation';
    const type=id==='memory_heist'?'MEMORY_DRAFT':id==='safecracker'?'CODE_GUESS':'TREASURE_COMMIT';
    const len=id==='memory_heist'?9:3;
    for(const arr of [new Array(len),Array(len).fill(undefined),Array(len).fill(Infinity),Array(len).fill(.5),Array(len).fill('1')]){
      assert.equal(act(s,'a',{type,[field]:arr,lock:true},now).accepted,false);
    }
    assert.equal(act(s,'a',getV2BotAction(projectV2Game(s,'a',now),()=>.2),now).accepted,true);
  }
});


test('JSON identifier keys cannot bypass commitment locks',()=>{
  for(const id of ['crowd_count','treasure_tug'] as const){
    let s=initV2Game(id,['__proto__','b'],start,()=>.4);const now=id==='crowd_count'?start+2000:start;
    const action=id==='crowd_count'?{type:'COUNT_GUESS',value:10}:{type:'TREASURE_COMMIT',allocation:[1,2,7]};
    assert.equal(act(s,'__proto__',action,now).accepted,true);
    assert.equal(act(s,'__proto__',action,now).accepted,false);
    s=roundtrip(s);assert.equal(act(s,'__proto__',action,now).accepted,false);
  }
});

test('circuit helper rejects malformed boards without interpreting missing ports',()=>{
  for(const rotations of [Array(16).fill(-1),Array(16).fill(4),Array(16).fill(NaN),new Array(16)])
    assert.deepEqual(evaluateCircuit(Array(16).fill('straight'),rotations),{powered:[],solved:false});
});

test('circuit validation excludes unrecognized pipe kinds',()=>{
  assert.deepEqual(evaluateCircuit(Array(16).fill('bad'),Array(16).fill(3)),{powered:[],solved:false});
});

test('generated mirror choices are asymmetric as well as nonambiguous',()=>{
  for(let seed=1;seed<=20;seed++){
    let n=seed;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296);
    const s=initV2Game('mirror_trouble',['a','b'],0,random);if(s.data.kind!=='mirror_trouble')throw Error();
    for(const p of s.data.puzzles)for(const choice of p.choices){
      assert.notEqual(shapeRotationKey(choice),shapeRotationKey(choice.map(cell=>Math.floor(cell/5)*5+4-cell%5)));
    }
  }
});

test('circuit connection locks boards and compares moves independently of completion time',()=>{
  const s=make('circuit_sprint');advanceV2Game(s,start);if(s.data.kind!=='circuit_sprint')throw Error();
  for(let n=0;n<4;n++)act(s,'a',{type:'PIPE_ROTATE',cell:0});
  const solve=(who:string,now:number)=>{
    if(s.data.kind!=='circuit_sprint')throw Error();
    for(let cell=0;cell<16;cell++)while(!s.data.players[who].solved&&s.data.players[who].rotations[cell]!==s.data.solutionRotations[cell])act(s,who,{type:'PIPE_ROTATE',cell},now);
  };
  solve('a',start);assert.equal(s.data.players.a.solved,true);
  assert.equal(act(s,'a',{type:'PIPE_ROTATE',cell:0}).accepted,false);
  solve('b',start+1000);assert.equal(s.finished,true);assert.equal(s.winnerId,'b');
  assert.equal(s.data.players.a.moves-s.data.players.b.moves,4);
});

test('memory timeout scores the last valid editable draft and blank default',()=>{
  const s=make('memory_heist');advanceV2Game(s,start+4000);if(s.data.kind!=='memory_heist')throw Error();
  act(s,'a',{type:'MEMORY_DRAFT',board:s.data.answer,lock:false},start+4000);
  assert.equal(act(s,'a',{type:'MEMORY_DRAFT',board:Array(9).fill(1),lock:false},start+5000).accepted,false);
  advanceV2Game(s,s.endsAt);assert.equal(s.scores.a,6);assert.equal(s.scores.b,0);
});

test('portable parity fixtures reproduce all eight expected action traces',async()=>{
  const {readFileSync}=await import('node:fs');
  const fixtures=JSON.parse(readFileSync(new URL('./fixtures/v2-parity.json',import.meta.url),'utf8'));
  assert.equal(fixtures.cases.length,8);
  for(const fixture of fixtures.cases){
    const state=roundtrip(fixture.initialState);
    for(const step of fixture.steps)assert.equal(act(state,step.fighterId,step.action,step.nowMs).accepted,true,fixture.name);
    advanceV2Game(state,fixture.finalAt);
    assert.deepEqual({finished:state.finished,winnerId:state.winnerId,scores:state.scores,stageIndex:state.stageIndex,phase:state.phase},fixture.expected,fixture.name);
  }
});

test('bots never act on spectator projections or outside active phases',()=>{
  for(const id of V2_GAME_IDS){
    const s=make(id);assert.equal(getV2BotAction(projectV2Game(s,'a',start-1)),null);
    assert.equal(getV2BotAction(projectV2Game(s,null,start+4000)),null);
    advanceV2Game(s,s.endsAt);assert.equal(getV2BotAction(projectV2Game(s,'a',s.endsAt)),null);
  }
});
