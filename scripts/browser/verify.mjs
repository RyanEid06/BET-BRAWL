import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(process.env.BRAWL_PLAYWRIGHT_MODULE || import.meta.url);
const {chromium}=require('playwright');
fs.mkdirSync('output/playwright',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BRAWL_CHROME_EXECUTABLE,headless:true});
const games=['memory_heist','crowd_count','mirror_trouble','safecracker','circuit_sprint','split_decision','treasure_tug','pocket_territory'];
const results=[],issues=[],consoleErrors=[];
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
async function snapshot(page){return page.evaluate(()=>window.__v2.snapshot())}
async function reset(page,id,mode='active'){await page.evaluate(({id,mode})=>window.__v2.reset(id,mode),{id,mode});await page.waitForTimeout(35)}
async function scan(page,label){const metrics=await page.evaluate(()=>{const game=document.querySelector('.v2-game'),r=game.getBoundingClientRect();const buttons=[...game.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')].map(e=>{const b=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.innerText,width:b.width,height:b.height}});const out=[...game.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.left<-1||b.right>innerWidth+1}).map(e=>({tag:e.tagName,text:e.innerText?.slice(0,50),width:e.getBoundingClientRect().width}));return {pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,gameWidth:r.width,gameHeight:r.height,overflow:out,smallTargets:buttons.filter(e=>e.width<44||e.height<44),enabled:buttons.length}});if(metrics.overflow.length||metrics.pageWidth>metrics.viewport)issues.push({label,type:'overflow',metrics});if(metrics.smallTargets.length)issues.push({label,type:'small-target',targets:metrics.smallTargets});return metrics}
try{
for(const [width,height] of [[360,640],[390,844],[768,1024],[1366,768]]){
 const touch=width<800;const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});const page=await context.newPage();page.on('pageerror',e=>consoleErrors.push(String(e)));await page.goto(`${process.env.BRAWL_BROWSER_URL || 'http://127.0.0.1:5175'}/scripts/browser/v2.html`);await page.waitForFunction(()=>window.__v2);
 const activate=async locator=>touch?locator.tap():locator.click();
 for(const id of games){
 await reset(page,id);const metrics=await scan(page,`${width}-${id}-active`);await page.screenshot({path:`output/playwright/${width}-${id}-active.png`,fullPage:true});
 if(id==='memory_heist'){await activate(page.getByRole('button',{name:/Row 1, column 1/}));await activate(page.getByRole('button',{name:'Undo',exact:true}));await activate(page.getByRole('button',{name:/Row 1, column 2/}));await activate(page.getByRole('button',{name:'Lock board',exact:true}));}
 if(id==='crowd_count'){await activate(page.getByRole('button',{name:'Increase estimate'}));await activate(page.getByRole('button',{name:'Lock estimate',exact:true}));assert(await page.locator('.v2-scene').count()===0,'count scene persisted in answer');}
 if(id==='mirror_trouble')await activate(page.getByRole('button',{name:/^Choice 1/}));
 if(id==='safecracker'){await page.getByLabel('Slot 1').selectOption('2');await activate(page.getByRole('button',{name:/Submit guess/}));await page.waitForTimeout(50);assert((await snapshot(page)).projection.state.mine.history.length===1,'code clue missing')}
 if(id==='circuit_sprint')await activate(page.getByRole('button',{name:/Row 1, column 1/}));
 if(id==='split_decision')await activate(page.getByRole('button',{name:/^ATTACK/}));
 if(id==='treasure_tug'){await activate(page.getByRole('button',{name:'Balanced 3 / 3 / 4',exact:true}));await activate(page.getByRole('button',{name:/Lock allocation/}));}
 if(id==='pocket_territory')await activate(page.getByRole('button',{name:/Tile 2, row 1, column 2/}));
 await page.waitForTimeout(40);const state=await snapshot(page);assert(state.actions.length>0,`${id} no action`);assert(state.actions.every(a=>a.result.accepted),`${id} invalid emitted action`);assert((await page.locator('.v2-feedback').innerText()).includes(id==='circuit_sprint'||id==='safecracker'?'server':'locked')||id==='memory_heist','confirmation feedback missing');
 if(['memory_heist','crowd_count','mirror_trouble','split_decision','treasure_tug','pocket_territory'].includes(id))assert(await page.locator('.v2-game button:enabled,.v2-game input:enabled').count()===0,`${id} locked controls remain active`);
 await page.evaluate(()=>window.__v2.step(100000));await page.waitForTimeout(35);assert(await page.locator('.v2-result').count()===1,'submitted game final result missing');await page.screenshot({path:'output/playwright/' + width + '-' + id + '-submitted-result.png',fullPage:true});
 await reset(page,id,'spectator');const spectator=await scan(page,`${width}-${id}-spectator`);assert(await page.locator('.v2-game button:enabled,.v2-game select:enabled,.v2-game input:enabled').count()===0,'spectator controls enabled');assert(!(await snapshot(page)).projection.state.mine,'spectator own state present');await page.screenshot({path:`output/playwright/${width}-${id}-spectator.png`,fullPage:true});
 await reset(page,id,'finished');const finished=await scan(page,`${width}-${id}-finished`);assert(await page.locator('.v2-result').count()===1,'result missing');assert(await page.locator('.v2-game button:enabled').count()===0,'finished controls enabled');await page.screenshot({path:`output/playwright/${width}-${id}-finished.png`,fullPage:true});
 results.push({viewport:[width,height],input:touch?'touch':'mouse',id,actions:state.actions,metrics,spectator,finished});
 }
 // Timed hidden-state transitions and keyboard focus use the actual component.
 await reset(page,'memory_heist','study');assert(await page.getByRole('group',{name:'Board to memorize'}).count()===1,'study board missing');await page.evaluate(()=>window.__v2.step(4000));await page.waitForTimeout(35);assert(await page.getByRole('group',{name:'Board to memorize'}).count()===0,'study board persists');assert(!(await snapshot(page)).projection.config.board,'answer board retained in config');
 await reset(page,'crowd_count','study');assert(await page.locator('.v2-scene .v2-object').count()===36,'count objects missing');await page.evaluate(()=>window.__v2.step(2000));await page.waitForTimeout(35);assert(await page.locator('.v2-scene').count()===0,'count objects remain after view');
 await reset(page,'split_decision');await page.keyboard.press('Tab');const focus=await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return {tag:e.tagName,outline:s.outlineStyle,width:s.outlineWidth}});assert(focus.tag==='BUTTON'&&focus.outline==='solid'&&parseFloat(focus.width)>=2,'keyboard focus outline missing');assert(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),'reduced motion absent');
 await activate(page.getByRole('button',{name:/^GUARD/}));const beforeOrientation=await snapshot(page);await page.setViewportSize({width:height,height:width});await page.waitForTimeout(35);assert(JSON.stringify((await snapshot(page)).projection.state.mine)===JSON.stringify(beforeOrientation.projection.state.mine),'orientation discarded commitment');await scan(page,`${width}-orientation`);await page.screenshot({path:`output/playwright/${width}-orientation.png`,fullPage:true});
 await context.close();
}
} catch(error){issues.push({type:'assertion',error:String(error),stack:error.stack});process.exitCode=1}
finally {await browser.close();fs.writeFileSync('output/playwright/results.json',JSON.stringify({results,issues,consoleErrors},null,2));console.log(JSON.stringify({cases:results.length,issues,consoleErrors},null,2))}



