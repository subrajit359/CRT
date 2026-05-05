import{r as o,a as e}from"./vendor-react-q9arMp5r.js";import{u as P}from"./vendor-router-BH-DgxJe.js";import{e as T,a as g,A as E}from"./index-BSbWYGna.js";import{P as R}from"./Pagination-B3mOiRmw.js";import{_ as D,f as V}from"./vendor-icons-CHC1Tcuf.js";import{m as y}from"./vendor-motion-DmWiHZDz.js";import"./vendor-misc-DqsnOac5.js";import"./vendor-react-dom-DOkCZvSq.js";const h=12;function _(){const[,n]=P(),[a,u]=o.useState([]),[s,c]=o.useState(""),[t,m]=o.useState(""),[l,d]=o.useState(!1),[i,N]=o.useState(null),[v,b]=o.useState(!1),x=T();o.useEffect(()=>{g.get("/api/cases/specialties").then(r=>u(r.specialties))},[]),o.useEffect(()=>{if(!s){N(null);return}let r=!1;b(!0),N(null);const p=new URLSearchParams({specialty:s});return t&&p.set("level",t),g.get(`/api/cases/groups?${p.toString()}`).then(f=>{r||N(f)}).catch(f=>{r||x.error(f.message||"Failed to load groups")}).finally(()=>{r||b(!1)}),()=>{r=!0}},[s,t]);async function w(){d(!0);try{const r=new URLSearchParams;s&&r.set("specialty",s),t&&r.set("level",t);const p=await g.get(`/api/cases/random?${r.toString()}`);n(`/case/${p.id}`)}catch(r){x.error(r.message||"No cases available with those filters")}finally{d(!1)}}function S(r){const f=r.cases.find(k=>!k.attempted)||r.cases[0];if(!f)return;const j=new URLSearchParams({specialty:s,group:String(r.index)});t&&j.set("level",String(t)),n(`/case/${f.id}?${j.toString()}`)}const C=o.useMemo(()=>i?i.groups.reduce((r,p)=>r+p.attemptedCount,0):0,[i]);return e.jsxDEV(E,{children:e.jsxDEV("div",{className:"container fade-in",style:{maxWidth:920},children:[e.jsxDEV("h2",{children:"Start a case"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:75,columnNumber:9},this),e.jsxDEV("p",{className:"muted",style:{marginTop:6},children:"Pick a specialty and level to see your groups, or jump into a random case."},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:76,columnNumber:9},this),e.jsxDEV("div",{className:"spacer-7"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:79,columnNumber:9},this),e.jsxDEV("div",{className:"card",children:[e.jsxDEV("div",{className:"row",style:{gap:16,flexWrap:"wrap"},children:[e.jsxDEV("div",{className:"field",style:{flex:1,minWidth:240},children:[e.jsxDEV("label",{className:"label",children:"Specialty"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:84,columnNumber:15},this),e.jsxDEV("select",{className:"select",value:s,onChange:r=>c(r.target.value),children:[e.jsxDEV("option",{value:"",children:"Any specialty"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:86,columnNumber:17},this),a.map(r=>e.jsxDEV("option",{children:r},r,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:87,columnNumber:41},this))]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:85,columnNumber:15},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:83,columnNumber:13},this),e.jsxDEV("div",{className:"field",style:{flex:1,minWidth:200},children:[e.jsxDEV("label",{className:"label",children:"Difficulty"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:91,columnNumber:15},this),e.jsxDEV("select",{className:"select",value:t,onChange:r=>m(r.target.value),children:[e.jsxDEV("option",{value:"",children:"Any level"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:93,columnNumber:17},this),[1,2,3,4,5,6,7].map(r=>e.jsxDEV("option",{value:r,children:["Level ",r]},r,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:94,columnNumber:45},this))]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:92,columnNumber:15},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:90,columnNumber:13},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:82,columnNumber:11},this),e.jsxDEV("div",{className:"spacer-7"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:98,columnNumber:11},this),e.jsxDEV("button",{className:"btn btn-ghost btn-block row",style:{justifyContent:"center",gap:8,alignItems:"center"},disabled:l,onClick:w,children:l?e.jsxDEV("span",{className:"spinner"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:105,columnNumber:21},this):e.jsxDEV(e.Fragment,{children:[e.jsxDEV(D,{size:16,strokeWidth:1.75,"aria-hidden":"true"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:107,columnNumber:17},this),"Pick a random case for me"]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:106,columnNumber:15},this)},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:99,columnNumber:11},this),e.jsxDEV("div",{className:"muted small",style:{marginTop:8,textAlign:"center"},children:["Tip: choose a specialty to unlock group practice below. Leave Difficulty as ",e.jsxDEV("em",{children:"Any level"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:113,columnNumber:89},this)," to mix all levels."]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:112,columnNumber:11},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:81,columnNumber:9},this),s&&e.jsxDEV(e.Fragment,{children:[e.jsxDEV("div",{className:"spacer-7"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:119,columnNumber:13},this),e.jsxDEV(G,{loading:v,data:i,specialty:s,level:t,totalAttempted:C,onOpen:S},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:120,columnNumber:13},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:118,columnNumber:11},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:74,columnNumber:7},this)},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:73,columnNumber:5},this)}function G({loading:n,data:a,specialty:u,level:s,totalAttempted:c,onOpen:t}){if(n)return e.jsxDEV("div",{className:"card",children:e.jsxDEV("div",{className:"row",style:{alignItems:"center",gap:10},children:[e.jsxDEV("span",{className:"spinner"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:140,columnNumber:11},this)," ",e.jsxDEV("span",{className:"muted",children:"Loading groups…"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:140,columnNumber:40},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:139,columnNumber:9},this)},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:138,columnNumber:7},this);if(!a)return null;const m=s?`Level ${s}`:"All levels";if(!a.groups.length)return e.jsxDEV("div",{className:"card",children:[e.jsxDEV("h3",{style:{marginTop:0},children:"No cases yet"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:150,columnNumber:9},this),e.jsxDEV("p",{className:"muted",style:{marginBottom:0},children:["There are no cases in ",e.jsxDEV("strong",{children:u},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:152,columnNumber:33},this)," · ",m," yet. Try a different combination, or use the random pick above."]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:151,columnNumber:9},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:149,columnNumber:7},this);const l=a.totalCases?Math.round(c/a.totalCases*100):0;return e.jsxDEV(y.div,{initial:{opacity:0,y:8},animate:{opacity:1,y:0},transition:{duration:.25},children:[e.jsxDEV("div",{className:"card",style:{background:"linear-gradient(135deg, rgba(200,169,106,0.10), rgba(200,169,106,0.02))"},children:[e.jsxDEV("div",{className:"row-between",style:{alignItems:"flex-start",flexWrap:"wrap",gap:12},children:[e.jsxDEV("div",{children:[e.jsxDEV("h3",{style:{margin:0},children:[u," · ",m]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:169,columnNumber:13},this),e.jsxDEV("div",{className:"muted small",style:{marginTop:4},children:[a.totalCases," case",a.totalCases===1?"":"s"," in ",a.groups.length," group",a.groups.length===1?"":"s"," of ",a.groupSize,a.suggestedGroup&&` · Continue with Group ${a.suggestedGroup}`]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:170,columnNumber:13},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:168,columnNumber:11},this),e.jsxDEV("div",{style:{textAlign:"right"},children:[e.jsxDEV("div",{style:{fontSize:28,fontWeight:700,lineHeight:1},children:[l,"%"]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:176,columnNumber:13},this),e.jsxDEV("div",{className:"muted small",children:[c," / ",a.totalCases," attempted"]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:177,columnNumber:13},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:175,columnNumber:11},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:167,columnNumber:9},this),e.jsxDEV("div",{style:{marginTop:12},children:e.jsxDEV(A,{pct:l},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:181,columnNumber:11},this)},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:180,columnNumber:9},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:166,columnNumber:7},this),e.jsxDEV("div",{className:"spacer-7"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:185,columnNumber:7},this),e.jsxDEV(L,{groups:a.groups,suggestedGroup:a.suggestedGroup,onOpen:t},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:187,columnNumber:7},this),e.jsxDEV("style",{children:`
        .group-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
        }
        .group-card {
          position: relative;
          padding: 16px;
          border-radius: 14px;
          border: 1px solid var(--line, #e5e3da);
          background: var(--bg-1, #fff);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
        }
        .group-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(20,20,30,0.08);
          border-color: var(--accent, #c8a96a);
        }
        .group-card.completed {
          background: linear-gradient(160deg, rgba(76,175,80,0.10), rgba(76,175,80,0.02));
          border-color: rgba(76,175,80,0.45);
        }
        .group-card.in-progress {
          background: linear-gradient(160deg, rgba(200,169,106,0.12), rgba(200,169,106,0.02));
          border-color: var(--accent, #c8a96a);
        }
        .group-card.suggested::after {
          content: "▶ continue";
          position: absolute;
          top: 10px;
          right: 10px;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 999px;
          background: var(--accent, #c8a96a);
          color: #1a1a1a;
        }
        .group-num {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted, #666);
        }
        .group-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
        }
        .group-dots {
          display: flex;
          gap: 6px;
          margin-top: 2px;
        }
        .group-dot {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(0,0,0,0.08);
          transition: background 200ms ease;
        }
        .group-dot.done { background: #4caf50; }
        .group-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
        }
        .group-status {
          font-weight: 600;
        }
        .group-status.completed { color: #2e7d32; }
        .group-status.in-progress { color: #b8860b; }
        .group-status.fresh { color: var(--muted, #666); }
        .pbar {
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: rgba(0,0,0,0.08);
          overflow: hidden;
        }
        .pbar > span {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, var(--accent, #c8a96a), #d4b97a);
          transition: width 400ms ease;
        }
      `},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:194,columnNumber:7},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:161,columnNumber:5},this)}function L({groups:n,suggestedGroup:a,onOpen:u}){const s=Math.max(1,Math.ceil(n.length/h)),c=a?Math.max(1,Math.ceil(a/h)):1,[t,m]=o.useState(c);o.useEffect(()=>{t>s&&m(s)},[t,s]);const l=(t-1)*h,d=n.slice(l,l+h);return e.jsxDEV(e.Fragment,{children:[e.jsxDEV("div",{className:"group-grid",children:d.map(i=>e.jsxDEV($,{group:i,isSuggested:i.index===a,onOpen:()=>u(i)},i.index,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:315,columnNumber:11},this))},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:313,columnNumber:7},this),e.jsxDEV(R,{page:t,totalPages:s,total:n.length,onChange:m},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:323,columnNumber:7},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:312,columnNumber:5},this)}function $({group:n,isSuggested:a,onOpen:u}){const s=n.completed,c=!s&&n.attemptedCount>0,t=s?"completed":c?"in-progress":"fresh",m=s?"Completed":c?"In progress":"Not started",l=["group-card",t,a?"suggested":""].filter(Boolean).join(" ");return e.jsxDEV("button",{type:"button",className:l,onClick:u,children:[e.jsxDEV("div",{className:"group-num",children:["Group ",n.index]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:341,columnNumber:7},this),e.jsxDEV("div",{className:"group-title",children:[n.attemptedCount," / ",n.total]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:342,columnNumber:7},this),e.jsxDEV("div",{className:"group-dots","aria-hidden":"true",children:n.cases.map((d,i)=>e.jsxDEV("div",{className:`group-dot ${d.attempted?"done":""}`,title:`Case ${i+1}: ${d.attempted?"attempted":"not attempted"}`},d.id,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:347,columnNumber:11},this))},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:345,columnNumber:7},this),e.jsxDEV("div",{className:"group-meta",children:[e.jsxDEV("span",{className:`group-status ${t} row`,style:{gap:4,alignItems:"center",display:"inline-flex"},children:[s&&e.jsxDEV(V,{size:12,strokeWidth:1.75,"aria-hidden":"true"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:352,columnNumber:27},this),m]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:351,columnNumber:9},this),e.jsxDEV("span",{className:"muted small",children:s?"Practice again →":c?"Continue →":"Start →"},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:355,columnNumber:9},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:350,columnNumber:7},this)]},void 0,!0,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:340,columnNumber:5},this)}function A({pct:n}){return e.jsxDEV("div",{className:"pbar",role:"progressbar","aria-valuenow":n,"aria-valuemin":0,"aria-valuemax":100,children:e.jsxDEV("span",{style:{width:`${n}%`}},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:366,columnNumber:7},this)},void 0,!1,{fileName:"/home/runner/workspace/CRT/frontend/src/pages/PracticeStart.jsx",lineNumber:365,columnNumber:5},this)}export{_ as default};
