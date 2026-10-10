import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { t } from '@nothingleft/i18n';
import { ASSET_BASE_URL } from '@config/constants';
import { renderHtml } from '@lib/email-html';
import { EMAIL_SAMPLES } from './email-samples';

const out = resolve(import.meta.dir, '../../../design/emails/all.html');

const emails = EMAIL_SAMPLES.map(sample => ({
  id: sample.id,
  group: sample.group,
  subject: t(sample.subject, sample.params),
  to: sample.to,
  html: renderHtml({ ...sample, assetBaseUrl: ASSET_BASE_URL }),
}));

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nothing Left — all emails</title>
<style>
:root{--bg:#f3f3f5;--surf:#fff;--bd:#e0e1e3;--tx:#151618;--sec:#585b5f;--inset:#eff0f1;--ink:#151618;--inkfg:#fff}
@media(prefers-color-scheme:dark){[data-chrome=system]{--bg:#121417;--surf:#1a1c1f;--bd:#2e3034;--tx:#e6e8ea;--sec:#a5a8ad;--inset:#26282b;--ink:#e9ebee;--inkfg:#151618}}
[data-chrome=dark]{--bg:#121417;--surf:#1a1c1f;--bd:#2e3034;--tx:#e6e8ea;--sec:#a5a8ad;--inset:#26282b;--ink:#e9ebee;--inkfg:#151618}
*{box-sizing:border-box}body{margin:0;font:13px/18px Inter,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--tx)}
header{position:sticky;top:0;z-index:2;display:flex;gap:16px;align-items:center;padding:10px 16px;background:var(--surf);border-bottom:1px solid var(--bd)}
.seg{display:inline-flex;border:1px solid var(--bd);border-radius:4px;overflow:hidden}
.seg button{all:unset;cursor:pointer;padding:5px 11px;color:var(--sec);border-left:1px solid var(--bd)}.seg button:first-child{border-left:0}
.seg button[aria-pressed=true]{background:var(--ink);color:var(--inkfg)}
.grow{flex:1}.layout{display:flex;height:calc(100vh - 51px)}
nav{width:300px;overflow:auto;border-right:1px solid var(--bd);background:var(--surf);padding:8px 0}
nav h2{margin:14px 16px 4px;font-size:12px;color:var(--sec);font-weight:600}
nav a{display:block;padding:5px 16px;color:var(--tx);text-decoration:none;cursor:pointer}nav a:hover{background:var(--inset)}nav a[aria-current=true]{background:var(--inset);font-weight:600}
nav small{display:block;color:var(--sec);font:11px/14px ui-monospace,Menlo,monospace}
main{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;align-items:center}
.meta{width:var(--w,640px);max-width:100%;margin-bottom:10px;color:var(--sec)}.meta b{color:var(--tx)}
iframe{width:var(--w,640px);max-width:100%;flex:1;min-height:600px;border:1px solid var(--bd);border-radius:6px;background:#fff}
</style></head>
<body data-chrome="system">
<header><b>All emails (${emails.length})</b><span class="grow"></span>
<div class="seg" id="theme"><button data-v="system" aria-pressed="true">System</button><button data-v="light">Light</button><button data-v="dark">Dark</button></div>
<div class="seg" id="width"><button data-v="640" aria-pressed="true">Desktop</button><button data-v="375">Mobile</button></div></header>
<div class="layout"><nav id="nav"></nav><main><div class="meta" id="meta"></div><iframe id="frame" title="Email preview"></iframe></main></div>
<script>
const emails=${JSON.stringify(emails).replace(/</g, '\\u003c')};
const nav=document.getElementById('nav'),frame=document.getElementById('frame'),meta=document.getElementById('meta');
let cur=0,theme='system';
const DARK=/@media \\(prefers-color-scheme:dark\\)\\{/;
function themed(html){
  if(theme==='light') return html.replace(DARK,'@media print{');
  if(theme==='dark') return html.replace(DARK,'@media all{');
  return html;
}
function show(i){cur=i;const e=emails[i];
  frame.srcdoc=themed(e.html);
  meta.innerHTML='<b>'+e.id+'</b><br>Subject: '+e.subject.replace(/</g,'&lt;')+'<br>To: '+e.to;
  nav.querySelectorAll('a').forEach((a,n)=>a.toggleAttribute('aria-current',n===i)||0);
  nav.querySelectorAll('a').forEach((a,n)=>a.setAttribute('aria-current',n===i));}
let group='';
emails.forEach((e,i)=>{if(e.group!==group){group=e.group;const h=document.createElement('h2');h.textContent=group;nav.append(h)}
  const a=document.createElement('a');a.innerHTML=e.subject.replace(/ · Nothing Left$/,'').replace(/</g,'&lt;')+'<small>'+e.id+'</small>';a.onclick=()=>show(i);nav.append(a)});
const wire=(id,fn)=>document.querySelectorAll('#'+id+' button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#'+id+' button').forEach(x=>x.setAttribute('aria-pressed',x===b));fn(b.dataset.v)});
wire('theme',v=>{theme=v;document.body.dataset.chrome=v;show(cur)});
wire('width',v=>document.documentElement.style.setProperty('--w',v+'px'));
show(0);
</script></body></html>`;

writeFileSync(out, page);
console.log(`${emails.length} emails -> ${out}`);
