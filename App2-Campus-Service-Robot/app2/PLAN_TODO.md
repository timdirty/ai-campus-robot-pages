# 校園服務機器人 App PLAN_TODO

## 作品定位

多功能校園服務機器人：配送福利社商品、排程清潔、輔助教學、提醒準時上課、放學引導與安全巡邏。

## 現況

- 已完成 localStorage/reducer 本機狀態串聯，無雲端也能完整展示。
- 配送、送達、點名、課堂問答、分心提醒、排程、派遣、緊急封鎖、報表與重置都能操作。
- 已新增 `RobotCommandLog` 與 `HardwareMode`，首頁會顯示「UNO R4 bridge 指令」。
- 已接上 App 1 共用 Node/Serial bridge，主要任務會自動 POST 到 `/api/robot/command`，首頁顯示已送、待送或未連線。
- 新任務硬體指令先進 `queued`，bridge 回覆後標記 `sent` 或 `failed`；庫存不足的失敗訂單不會送硬體。
- 已新增首頁 3 分鐘評審展示模式，把配送、追蹤、教學、派遣、報表串成任務鏈。
- 已補強 localStorage 壞資料恢復測試，避免現場瀏覽器資料破損造成展示中斷。
- 設定面板已提供展示 state JSON 匯出/匯入；讀到半壞資料時會修復並寫回 localStorage，同時保留有效訂單。
- 行動版已解除主畫面 `max-w-md` 手機殼限制，改成可吃滿螢幕的中控台版面；子頁與 bottom sheet 也改為手機優先寬度。
- 已新增根目錄 `scripts/mobile-layout-check.mjs`，可用 390px 手機 viewport 量測水平溢出、截字與過小按鈕。
- 已新增 `STUDENT_DEMO_GUIDE.md`，提供學生操作入口、上台分工、3 分鐘講稿、評審問答與 Arduino 連動後續計畫。
- 已新增手動遙控中心（FAB + 虛擬搖桿），可控制底盤前後左右與滾筒；放開搖桿自動停車；韌體看門狗 3 秒保護。

## Demo 腳本

學生講解版請看 `STUDENT_DEMO_GUIDE.md`。

1. 首頁看機隊狀態與 UNO R4 bridge 指令。
2. 配送頁下單，確認庫存、訂單、任務、機器人狀態與指令 log 同步。
3. 追蹤頁完成送達。
4. 教學頁點名、回覆問題、處理提醒。
5. 生活頁調整清潔/廣播排程，開關智慧鐘聲。
6. 派遣地圖選區域，發送巡邏或疏導任務。
7. 安全封鎖開關展示校園緊急模式。
8. 產生報表並重置展示資料；可補測庫存不足訂單，確認只寫錯誤 log、不派遣硬體。

## Arduino R4 WiFi 對接

- App 2 使用獨立 bridge，預設 URL 為 `http://localhost:3204`，也可用 `VITE_ARDUINO_BRIDGE_URL` 覆蓋。
- 代表指令：`DELIVERY_START`、`DELIVERY_DONE`、`CLEAN_SCHEDULE`、`BROADCAST_SCHEDULE`、`TEACH_SCAN`、`FOCUS_NUDGE`、`QUESTION_ACK`、`TEACH_REPLY`、`PATROL_START`、`BROADCAST_START`、`SAFETY_LOCKDOWN`、`SAFETY_CLEAR`、`ROBOT_PAUSE`、`ROBOT_RESUME`、`SPEED_SET`。
- 未插 Arduino 時 bridge 回傳 fallback 狀態，App 不會中斷；插上並上傳韌體後同一批指令走 Serial。

## 待辦

- 接上實體 Arduino 後逐項校準服務型機器人的動作：前進、停止、左轉、右轉、廣播、LED 提示。
- 依照實機外殼與馬達接線微調目前高階任務指令對應的 firmware 低階動作。
- 若要多人輪流操作，使用設定面板匯出/匯入 demo state；匯入檔會先安全正規化。
- 比賽前用配送下單、追蹤送達、教學提醒、派遣廣播、報表中心完整跑一次。
- 手機 UI/UX 後續優先級：不受原始視覺稿限制，任務中控台要先確保文字不爆、卡片不擠、底部導覽不遮住操作。

## 十輪展示驗收

1. 首頁 3 分鐘展示模式能說明任務鏈與系統健康度。
2. 配送下單會同步庫存、訂單、任務、機器人與 UNO R4 bridge 指令；庫存不足不送硬體指令。
3. 追蹤頁完成送達後機器人回待命。
4. 教學頁點名、提問與分心提醒會寫入報告。
5. 派遣地圖會新增任務、日誌與 bridge 硬體指令。
6. 緊急封鎖會同步校園狀態、感測卡與 log。
7. 設定面板可重置、清 cache、匯出與匯入展示資料。
8. localStorage 空資料、壞資料、半壞訂單都能恢復。
9. 手機底部導覽和平板側欄不重疊。
10. `npm run check` 通過 state 測試、TypeScript 與 production build。

## 驗收

```zsh
npm run check
```
