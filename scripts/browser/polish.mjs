import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=createRequire(process.env.BRAWL_PLAYWRIGHT_MODULE||import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.BRAWL_CHROME_EXECUTABLE,headless:true});
const checks=[],errors=[];
fs.mkdirSync('output/playwright',{recursive:true});
try {
 for(const [width,height] of [[360,640],[390,844],[768,1024],[1366,768]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:width<800,hasTouch:width<800});
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${process.env.BRAWL_BROWSER_URL||'http://127.0.0.1:5175'}/scripts/browser/polish.html`);
  await page.waitForFunction(()=>window.__polish);
  const reset=async(id,options={})=>{await page.evaluate(({id,options})=>window.__polish.reset(id,options),{id,options});await page.waitForTimeout(60);};
  const step=async(ms)=>{await page.evaluate(ms=>window.__polish.step(ms),ms);await page.waitForTimeout(60);};
  const scan=async(label)=>{
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${label}: horizontal overflow`);
  };
  await reset('quick_draw');
  const arena=page.getByRole('button',{name:'Quick Draw arena'});
  await arena.waitFor({timeout:3000});
  assert.equal(await arena.isEnabled(),true,'Initial zero scores incorrectly locked arena');
  assert.match(await arena.innerText(),/WAIT — DO NOT TAP/);
  await arena.evaluate(e=>{e.click();e.click();});
  assert.equal(await page.evaluate(()=>window.__polish.actions.length),1,'Arena duplicated a tap before acknowledgement');
  await page.evaluate(()=>window.__polish.flush());
  assert.equal(await page.evaluate(()=>window.__polish.snapshot().result.winnerId),'b');
  assert.match(await arena.innerText(),/FALSE START/);
  await scan('quick-wait');
  await reset('quick_draw');
  const delay=await page.evaluate(()=>window.__polish.snapshot().config.drawDelayMs);
  await step(delay+200);
  assert.match(await arena.innerText(),/DRAW — TAP ONCE!/);
  await arena.focus(); await page.keyboard.press('Space');
  await page.keyboard.down('Space'); await page.keyboard.up('Space');
  assert.equal(await page.evaluate(()=>window.__polish.actions.length),1);
  await page.evaluate(()=>window.__polish.flush());
  assert.equal(await page.evaluate(()=>window.__polish.snapshot().state.reactions.a),200);
  await page.screenshot({path:`output/playwright/${width}-quick-draw.png`,fullPage:true});
  await reset('quick_draw',{slot:'spectator'});
  assert.equal(await arena.isDisabled(),true);
  for(const [targetSeconds,blindSeconds] of [[3,1.5],[5,3],[7,3],[9,4]]) {
   await reset('millisecond_stop',{config:{targetSeconds,blindSeconds}});
   assert.match(await page.locator('main').innerText(),new RegExp(`TARGET: ${targetSeconds}\\.000s`));
   const stop=page.getByRole('button',{name:new RegExp(`SLAM AT ${targetSeconds}\\.000s`)});
   assert.equal(await stop.isEnabled(),true);
   await step(blindSeconds*1000-200);
   assert.equal(await page.getByText('??.???',{exact:true}).count(),0);
   await step(blindSeconds*1000+100);
   assert.equal(await page.getByText('??.???',{exact:true}).isVisible(),true);
   await stop.evaluate(e=>{e.click();e.click();});
   assert.equal(await page.evaluate(()=>window.__polish.actions.length),1);
   await scan('millisecond');
  }
  for(const id of ['memory_heist','crowd_count','mirror_trouble','safecracker','circuit_sprint','split_decision','treasure_tug','pocket_territory','millisecond_stop','rapid_red_green','speed_math','higher_lower','blind_pinpoint','quick_draw']) {
   await reset(id,{mode:'betting'});
   assert.equal(await page.getByRole('region',{name:'How to play'}).isVisible(),true);
   assert.ok(await page.getByRole('region',{name:'How to play'}).locator('li').count()<=3);
   await scan(id);
   if(['safecracker','millisecond_stop'].includes(id))await page.screenshot({path:`output/playwright/${width}-${id}-instructions.png`,fullPage:true});
   await reset(id,{mode:'betting',slot:'spectator'});
   assert.equal(await page.getByRole('region',{name:'How to play'}).count(),0);
   assert.equal(await page.getByRole('button',{name:/LOCK 100c WAGER/}).isVisible(),true);
  }
  await reset('millisecond_stop',{mode:'countdown',config:{targetSeconds:9,blindSeconds:4}});
  assert.match(await page.locator('main').innerText(),/Target: 9\.000s/);
  checks.push({viewport:[width,height],quickDraw:'arena/one-shot/false-start/keyboard/spectator',millisecond:'4 variants/hide/one-shot/countdown',instructions:'14 fighter/spectator games'});
  await context.close();
 }
 assert.deepEqual(errors,[]);
} catch(error) { errors.push(String(error)); process.exitCode=1; }
finally {await browser.close();fs.writeFileSync('output/playwright/polish.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));}
