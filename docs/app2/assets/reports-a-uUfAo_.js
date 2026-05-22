import{a as c}from"./localAi-CKaKplC_.js";function t(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function p({state:e,kind:n,title:l,studentId:d}){const a=d?e.studentReports[d]:void 0,o=e.teachingSignals,r=e.tasks.slice(0,6),s=new Intl.DateTimeFormat("zh-TW",{dateStyle:"medium",timeStyle:"short"}).format(new Date);return`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>${t(l)}</title>
  <style>
    body { margin: 0; background: #f7f9ff; color: #1a1c1e; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 880px; margin: 0 auto; padding: 42px 32px 64px; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #005bb3; padding-bottom: 24px; margin-bottom: 28px; }
    h1 { margin: 0; font-size: 32px; letter-spacing: .02em; }
    h2 { margin: 30px 0 12px; color: #005bb3; font-size: 18px; }
    .meta { color: #565e71; font-size: 13px; line-height: 1.7; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 20px 0; }
    .card { background: #fff; border: 1px solid #d8dee9; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(20, 31, 50, .06); }
    .label { font-size: 11px; color: #565e71; text-transform: uppercase; letter-spacing: .16em; font-weight: 800; }
    .value { margin-top: 8px; font-size: 28px; color: #005bb3; font-weight: 800; }
    ul { margin: 0; padding-left: 20px; line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    th { background: #eaf1ff; color: #123; }
    .actions { position: sticky; bottom: 0; background: rgba(247,249,255,.92); backdrop-filter: blur(14px); padding: 16px 0; display: flex; gap: 12px; }
    button { border: 0; border-radius: 12px; padding: 13px 18px; font-weight: 800; cursor: pointer; }
    .primary { background: #005bb3; color: white; }
    .secondary { background: #e2eaf4; color: #1a1c1e; }
    @media print {
      body { background: white; }
      main { padding: 0; }
      .actions { display: none; }
      .card, table { box-shadow: none; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <div class="label">校園服務機器人</div>
        <h1>${t(l)}</h1>
        <p class="meta">產生時間：${t(s)}<br />報表類型：${n==="student"?"學習狀態報告":"班級與任務摘要"}</p>
      </div>
      <div class="meta">資料來源：本機操作資料<br />狀態版本：${t(e.lastUpdated)}</div>
    </header>

    <section class="grid">
      <div class="card"><div class="label">出席</div><div class="value">${e.attendance.scanned?`${e.attendance.present}/${e.attendance.total}`:"待掃描"}</div></div>
      <div class="card"><div class="label">待處理訊號</div><div class="value">${o.length}</div></div>
      <div class="card"><div class="label">進行中任務</div><div class="value">${e.tasks.filter(i=>i.status==="in_progress").length}</div></div>
    </section>

    <h2>AI 摘要</h2>
    <div class="card">
      <p>${a?t(`${a.name}：${a.learningStyle}。本次紀錄彙整課堂參與、服務配送與任務回饋，供老師快速安排下一步協助。`):"本堂課的服務配送、校園派遣與任務回饋已完成彙整，可直接說明完整流程。"}</p>
    </div>

    <h2>${a?"學習訊號紀錄":"任務紀錄"}</h2>
    ${a?`<ul>${a.events.map(i=>`<li>${t(i)}</li>`).join("")}</ul>`:`<table><thead><tr><th>任務</th><th>區域</th><th>狀態</th><th>來源</th></tr></thead><tbody>${r.map(i=>`<tr><td>${t(i.title)}</td><td>${t(i.area)}</td><td>${t(i.status)}</td><td>${t(i.source)}</td></tr>`).join("")}</tbody></table>`}

    <h2>處理建議</h2>
    <ul>
      <li>持續保留機器人任務與課堂事件的時間序，方便回溯。</li>
      <li>比賽時建議依序操作：點名、處理提醒、下單配送、派遣任務、匯出報表。</li>
      <li>實體設備接上後，會沿用同一套任務紀錄與回饋流程。</li>
    </ul>

    <div class="actions">
      <button class="primary" onclick="window.print()">列印 / 另存 PDF</button>
      <button class="secondary" onclick="window.close()">關閉</button>
    </div>
  </main>
  <script>
    window.addEventListener('load', () => setTimeout(() => window.print(), 300));
  <\/script>
</body>
</html>`}async function h(e){e.kind==="class"&&await c(e.state);const n=p(e),l=window.open("","_blank","width=980,height=900");if(!l){const d=new Blob([n],{type:"text/html;charset=utf-8"}),a=URL.createObjectURL(d),o=document.createElement("a");o.href=a,o.download=`${e.title.replace(/\s+/g,"-")}.html`,o.click(),URL.revokeObjectURL(a);return}l.document.write(n),l.document.close()}export{h as o};
