import React from 'react';
import {createRoot} from 'react-dom/client';
import {V2GameView} from '../../src/components/games/V2GameView';
import {initV2Game,advanceV2Game,projectV2Game,processV2Action} from '../../src/engine/v2Games';
import '../../src/index.css';
const root=createRoot(document.getElementById('root')!);
const fighters=[{id:'a',name:'Alexandra Fighter A',avatar:'🦊'},{id:'b',name:'Benjamin Fighter B',avatar:'🐻'}] as any;
let authority:any, now:number, viewer:any='a', epoch=0;
const api:any={actions:[],errors:[], reset(id:string,mode='active') {let seed=98231;authority=initV2Game(id as any,['a','b'],Date.now(),()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296));now=authority.startsAt+(id==='memory_heist'?4001:id==='crowd_count'?2001:1);if(mode==='study')now=authority.startsAt+1;if(mode==='waiting')now=authority.startsAt-1;if(mode==='finished')now=authority.endsAt;viewer=mode==='spectator'?null:'a';advanceV2Game(authority,now);api.actions=[];api.errors=[];epoch++;render();}, step(ms:number){now+=ms;advanceV2Game(authority,now);render();}, setView(id:any){viewer=id;render();}, snapshot(){return {projection:projectV2Game(authority,viewer,now),actions:api.actions,phase:authority.phase,errors:api.errors};}};
function render(){const view=projectV2Game(authority,viewer,now);root.render(<div style={{width:'100%',padding:innerWidth<640?'12px':'16px',display:'flex',minHeight:'100vh',alignItems:'center'}}><V2GameView key={epoch} gameId={authority.id} gameConfig={view.config} gameState={view.state} fighterA={fighters[0]} fighterB={fighters[1]} myPlayerId={viewer} serverTimeOffset={now-Date.now()} onSendAction={action=>{const result=processV2Action(authority,'a',action,now);api.actions.push({action,result});if(!result.accepted)api.errors.push(result);render();}}/></div>)}
(window as any).__v2=api;api.reset('memory_heist');
import '../../src/components/games/V2GameView.css';
