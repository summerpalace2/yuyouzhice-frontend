// 实际渲染器与 CSS 的浏览器组件检查；固定数据，不代表全栈验收。
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
 try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__refactor-validation',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main style="max-width:720px;margin:24px auto;padding:12px" id="fixture"></main><script type="module">import {chatMessageHtml} from '/src/features/trip-chat/chat-panel.js';window.renderFixture=(status='pending',loading=false)=>{document.querySelector('#fixture').innerHTML=chatMessageHtml({role:'assistant',content:'已完成预览，请确认以下实际变化。',confirmRequest:{confirmId:'cfg_fixture',toolName:'confirm_apply_trip_adjustment',status,loading,summary:'将游览时段调整到下午。核验建议：当天交通耗时较长，请确认是否接受；系统不会自动替换景点。',args:{baseRevision:1,stopChanges:[{action:'UPDATED',stopName:'湖畔漫步 <img src=x onerror=alert(1)>',fields:{time:{before:'09:00',after:'16:00'},duration:{before:'60分钟',after:'90分钟'}}}]} }},0);};window.renderFixture();</script></body></html>`}));
 await page.goto(new URL('/__refactor-validation',process.env.APP_URL || 'http://127.0.0.1:5173').href);
 await page.waitForFunction(()=>typeof window.renderFixture==='function');
 assert.equal(await page.locator('.agent-confirm-card').count(),1);
 assert.match(await page.locator('.agent-confirm-changes').innerText(),/09:00[\s\S]*建议安排[\s\S]*16:00/);
 assert.equal(await page.locator('.agent-confirm-changes img').count(),0);
 for(const width of [1280,390]) {
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`width ${width} overflows`);
  assert.equal(await page.getByRole('button',{name:'应用修改',exact:true}).isVisible(),true);
 }
 await page.evaluate(()=>window.renderFixture('pending',true));
 assert.equal(await page.getByRole('button',{name:'正在执行…'}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'暂不修改'}).isDisabled(),true);
 for(const [status,label] of [['approved','已确认执行'],['cancelled','已取消'],['expired','已失效/需重发']]) {
  await page.evaluate(status=>window.renderFixture(status),status);
  assert.ok((await page.locator('.agent-confirm-status').innerText()).includes(label));
  assert.equal(await page.locator('.agent-confirm-actions button').count(),0);
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',viewports:[1280,390],checks:['authoritative diff','XSS escaping','no horizontal overflow','pending/loading/approved/cancelled/expired states'],scope:'Actual production renderer/CSS in Chromium; fixture data, no real model or BFF workflow'}));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
