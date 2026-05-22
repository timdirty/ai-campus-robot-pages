# AI 校園心靈守護者 PLAN_TODO

## 作品定位

校園情緒關懷與預警系統：透過節點感測、情緒趨勢、關懷提醒與自我照護工具，協助導師和輔導室更早發現需要支持的學生。

## 現況

- 已改為 local-first demo，不需要 Firebase 登入、不需要 Gemini key，也能完整展示。
- 已拆出 `GuardianState`、`GuardianAlert`、`GuardianNode`、`MoodLog`、`SupportMessage` 與本機 AI 回覆服務。
- 預警中心、自我照護、匿名心情牆、聊天、節點監控與重置都讀寫同一份 localStorage。
- 已加入本機狀態/AI 測試與示範資料 JSON 匯出。
- 文案改為「關懷提醒」與「輔導建議」，避免診斷式語氣。
- 已把共用 UI 小元件抽到 `src/components/guardianUi.tsx`，降低 `App.tsx` 維護負擔。
- 已將第一屏重整為沉浸式校園空間指揮中心，移除常駐展示步驟卡，改由 Demo 按鈕開啟導覽。
- 狀態讀取與匯入會逐筆修復 alerts、nodes、messages、posts 與 interventions，並把修復後資料寫回 localStorage。
- 已接上 App 1 共用 Node/Serial bridge，預警處理、佈署關懷與節點重新連線會送出 UNO R4 硬體提示指令。
- 已新增 `hardwareEvents`，紀錄抽屜可持續顯示硬體提示 sent/fallback 紀錄，匯出 JSON 也會包含該證據。
- 已新增感知中心：瀏覽器麥克風只做本機即時音量/波動運算，不保存錄音、不轉文字、不上傳雲端；聲量訊號可寫入 localStorage 並建立關懷提醒。
- 已新增 AI 主動巡查：融合心情簽到、環境聲量、節點狀態與未結案提醒，主動產生多來源關懷提醒。
- 已將校園空間指揮中心升級為主畫面：每個空間顯示風險、聲量、提醒數，並可直接指派機器人介入。
- 行動版 header 已改為雙列操作區，匯出、匯入、重置在手機上不再互相擠壓；卡片與節點地圖在小螢幕會降低圓角與 padding。
- 已新增根目錄 `scripts/mobile-layout-check.mjs`，可用 390px 手機 viewport 量測水平溢出、截字與過小按鈕。
- 已新增 `STUDENT_DEMO_GUIDE.md`，提供學生操作入口、上台分工、講稿、評審問答與 Arduino 連動後續計畫。
- 已新增底部可收折遙控列，D-pad 手動控制前後左右、速度與緊急停車；韌體看門狗 3 秒保護。

## Demo 腳本

學生講解版請看 `STUDENT_DEMO_GUIDE.md`。

1. 第一屏說明 AI 主動巡查校園空間，中央地圖顯示各區風險、聲量與提醒數。
2. 指出最高風險區域，點選中高風險區指派機器人介入。
3. 打開預警抽屜，選一筆提醒並勾選處置清單。
4. 打開感知抽屜，啟用麥克風或示範訊號，記錄環境聲量並建立提醒。
5. 打開照護抽屜，做心情簽到、匿名心情牆與安全空間聊天。
6. 打開節點抽屜，查看節點並重新連線離線節點。
7. 打開紀錄抽屜，確認機器人任務、硬體提示與支持方案。
8. 匯出或匯入目前示範資料 JSON，最後重置 demo 回到初始資料。

## Arduino R4 WiFi 對接

- App 3 使用獨立 bridge，預設 URL 為 `http://localhost:3203`，也可用 `VITE_ARDUINO_BRIDGE_URL` 覆蓋。
- 已支援指令：`ALERT_SIGNAL`、`CARE_DEPLOYED`、`NODE_RESTART`；firmware 也保留 `NODE_HEARTBEAT` 給下一階段節點回報。
- 未插 Arduino 時 bridge 回傳 fallback 並寫入硬體提示紀錄，不中斷關懷流程；插上並上傳韌體後同一批指令走 Serial。

## 待辦

- 如果有真 Firebase 專案，再把 local-first state 同步到 Firestore，但仍保留本機 fallback。
- 若要使用 Gemini，改由後端 proxy 呼叫，不在前端暴露 API key。
- 接上實機節點後校準 LED、Matrix 或提示器動作；仍需避免收集真學生個資，展示時只使用匿名代號。
- 比賽前用第一屏派遣機器人、預警處理、感知、自我照護、聊天、節點重新連線、匯出/重置完整跑一次。
- 手機 UI/UX 後續優先級：關懷工具以安全、清楚、少壓迫為先，不必沿用桌面版大卡片密度。

## 十輪展示驗收

1. 第一屏說清楚 AI 主動巡查、匿名、非診斷與機器人介入定位。
2. 預警中心勾選 checklist 後提醒進入處理中。
3. 佈署關懷會新增支持方案並更新相關提醒狀態。
4. 自我照護心情簽到會更新穩定度與最新紀錄。
5. 匿名心情牆投稿與按支持有即時回饋。
6. 安全空間聊天只做支持回覆，不宣稱診斷。
7. 感知中心可把本機聲量指標轉成關懷提醒，且匯出資料不含原始錄音。
8. AI 主動巡查可融合心情、聲量、節點與未結案提醒，主動建立多來源關懷提醒。
9. 校園空間指揮中心可顯示各區風險/聲量/提醒數，並建立機器人派遣任務。
10. 節點抽屜可重新連線離線節點。
11. 隱私模式、匯出、匯入、重置都有 toast 回饋。
12. localStorage 空資料、壞資料與半壞陣列會自我修復。
13. `npm run check` 通過狀態測試、AI 回覆測試、硬體事件紀錄測試、聲量感知測試、主動巡查測試、校園空間與機器人任務測試、TypeScript 與 production build。

## 驗收

```zsh
npm install
npm run check
```
