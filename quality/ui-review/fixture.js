import { handleChatAction } from '../../web/src/features/trip-chat/chat-action-handler.js';
import { renderChatInDOM } from '../../web/src/features/trip-chat/chat-panel.js';
import { observePlanningViewport } from '../../web/src/features/trip-chat/workspace-layout.js';
// Development-only visual fixture, outside Vite's web build root. No API or action dispatcher.
import { state } from '../../web/src/app-core/state.js';
import { header } from '../../web/src/widgets/header/header.js';
import { homeView } from '../../web/src/pages/home-page.js';
import { planView } from '../../web/src/pages/plan-page.js';
import { exploreView } from '../../web/src/pages/explore-page.js';
import { detailView } from '../../web/src/pages/detail-page.js';
import { tripsView } from '../../web/src/pages/trips-page.js';
import { historyView } from '../../web/src/pages/history-page.js';
import { profileView } from '../../web/src/pages/profile-page.js';
import { guestChatView } from '../../web/src/pages/guest-chat-page.js';
import { authView } from '../../web/src/pages/auth-page.js';
import { adminView, switchAdminSectionInDOM } from '../../web/src/pages/admin-page.js';
const sample = new URLSearchParams(location.search).get('view') || 'home';
const view = sample === 'draft' ? 'planning' : sample;
const items = [
 ['cq-hongyadong','洪崖洞','两江夜景','沿江散步，看灯火映入嘉陵江。留出一点时间，在山城的夜色里慢慢走。'],
 ['cq-liziba','李子坝','城市漫游','看看单轨穿楼而过，沿着坡道发现重庆独特的城市层次。'],
 ['cq-ciqikou','磁器口古镇','老街人文','在石板路和老茶馆之间，找一份属于自己的山城日常。']
].map(([id,name,category,summary])=>({id,name,category,summary,district:'重庆',tags:['慢慢逛','适合摄影'],ticket:'以现场公告为准',location:'106.57,29.56',duration:'90 分钟',image:new URL('/assets/chongqing-landscape.svg', location.origin).href}));
const trip={title:'两天一夜，把山城慢慢走遍',subtitle:'老街、江景与地道美食，留一点时间给沿途的惊喜',version:2,planMode:'AGENT_NATIVE',constraints:{companions:'长辈同行',walkingTolerance:'少走路',days:2,transportPreference:'轻轨地铁优先'},days:[{day:1,theme:'山城街巷 · 两江夜色',weather:{status:'待确认',value:'天气待确认'},stops:items.slice(0,2).map((x,i)=>({...x,id:`stop-${i}`,venueId:x.id,icon:'景',time:i?'16:30':'14:00',recommendationReason:'结合本次轻松出行的节奏，预留休息与拍照时间。',verifiedSource:'LOCAL_CATALOG'}))},{day:2,theme:'一杯茶，一段老街时光',stops:[{...items[2],id:'stop-2',venueId:items[2].id,time:'10:00',icon:'景'}]}]};
Object.assign(state,{view,user:['auth','guest-chat'].includes(view)?null:{id:'ui-review',name:'旅行者',role:view==='admin'?'admin':'user'},trip:['planning','explore','detail'].includes(view)?trip:null,sessionId:'ui-fixture-only',chatDockOpen:true,chatMode:'agent',chatMessages:[],profile:{memoryEnabled:true,profilePrependPrompt:'喜欢江边散步、老茶馆与地道本地菜。带父母旅行时，希望少爬坡，节奏从容。',memories:[],history:[],trips:[]},savedTrips:[{id:'demo-trip',savedAt:'2026-11-17T09:00:00Z',trip}],historySessions:[{id:'demo-session',createdAt:'2026-11-17T09:00:00Z',version:2,title:trip.title,prompt:state.prompt}],exploreItems:items,exploreCategories:['两江夜景','城市漫游','老街人文'],exploreLoaded:true,detail:{...items[0],intro:items[0].summary,image:'/assets/chongqing-landscape.svg',imageSource:'UI 样例插画',aiGuide:'【游玩建议】傍晚沿江散步，夜间赏灯；出发前确认天气与开放安排。'},adminOverview:{users:[],attractions:{total:3,items},analytics:{},knowledge:{},qualityMetrics:{}},adminDocs:[]});
if (sample === 'draft') state.trip = null;
if (sample === 'planning') {
  state.chatMessages = [{role:'user',content:'第二天可能下雨，把磁器口换成室内景点。'}, {
    role:'assistant',content:'可以，保留上午十点的安排，改去三峡博物馆。',
    confirmRequest:{confirmId:'ui-only',status:'pending',plannerSessionId:state.sessionId,
      toolName:'confirm_apply_trip_adjustment',summary:'第二天上午改为室内参观。',
      args:{baseRevision:2,stopChanges:[{key:'stop-2',action:'UPDATED',stopName:'第2天 · 磁器口古镇',
        fields:{name:{before:'磁器口古镇',after:'三峡博物馆'}}}]}}
  }];
}
const renderers={home:homeView,planning:planView,explore:exploreView,detail:detailView,trips:tripsView,history:historyView,profile:profileView,'guest-chat':guestChatView,auth:authView,admin:adminView};
document.querySelector('#topbar-mount').innerHTML=header();
document.querySelector('#view-mount').dataset.activeView=view;
document.querySelector('#view-mount').innerHTML=(renderers[view]||homeView)();
// Review-only navigation; mutation controls deliberately do not dispatch production actions.
document.addEventListener('click',event=>{const b=event.target.closest('[data-action="go"]');if(b){event.preventDefault();location.search=`?view=${b.dataset.view}`;}});

// Exercise the same local navigation as the console, without account mutations.
document.addEventListener('click', event => {
  const link = event.target.closest('[data-action="admin-section"]');
  if (link) switchAdminSectionInDOM(link.dataset.section);
});

// Test only the layout and confirmation flow using an isolated receipt.
if (view === 'planning') {
  observePlanningViewport();
  document.addEventListener('input', event => {
    if (event.target.id === 'chat-input') state.chatInput = event.target.value;
  });
  const actions = new Set(['select-stop','open-chat-dock','close-chat-dock','expand-assistant',
    'clear-stop-selection','agent-confirm-approve','agent-confirm-cancel','view-updated-itinerary']);
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-action]');
    if (!target || !actions.has(target.dataset.action)) return;
    await handleChatAction({ action:target.dataset.action, target, state, renderChatInDOM,
      renderView:() => { document.querySelector('#view-mount').innerHTML = planView(); },
      renderFloatingBtn() {}, toast() {},
      request:async (_, opts) => {
        if (!JSON.parse(opts.body).approved) return {ok:true,cancelled:true};
        const updated = structuredClone(trip);
        updated.version = 3;
        updated.days[1].stops[0].name = '三峡博物馆';
        return {ok:true,approved:true,data:{applied:true,sessionId:state.sessionId,currentVersion:3,trip:updated}};
      }
    });
  });
}
