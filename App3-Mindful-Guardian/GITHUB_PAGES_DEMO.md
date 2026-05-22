# App3 GitHub Pages 線上練習版

這個版本用來讓學生線上完整練習 Demo 流程，不需要 Arduino、Bridge server、Gemini API 或 Python。

## 發佈方式

1. 在 `app3` 目錄執行：

```bash
npm run build:pages
```

2. 將整個專案推到 GitHub。
3. 到 GitHub repo 的 `Settings → Pages`。
4. Source 選 `Deploy from a branch`。
5. Branch 選 `main`，Folder 選 `/docs`。

## 線上入口

- App3 主控台：`index.html`
- Robot 練習頁：`robot-display.html`

## 線上版可練習功能

- Demo 感測器：圖書館、穿堂、操場。
- AI 區域判讀：使用本機 AI 備援規則。
- 手動事件分級：可練習高風險/注意事件判斷。
- 學生照護建議：使用本機 AI 備援話術。
- Robot 顯示頁：可開啟、可練習自我介紹、語音對話、情緒偵測 UI。
- App3 → Robot 靜態同步：同一個 GitHub Pages 網域下，透過 `BroadcastChannel/localStorage` 同步快照與派遣資料。

## 線上版不包含

- 實體 Arduino 連線。
- 實體底盤馬達控制。
- 實體感測器讀值。
- 本機 WebSocket bridge。
- Python YOLO / LLMEmotion 後端。

比賽現場若要連接硬體，請使用 `start-app3-windows.bat` 啟動完整本機版。
