# App3 AI 校園心靈守護者啟動包

## Mac

建議用 Git clone 取得專案，然後雙擊 `start-app3-mac.command`。

如果 macOS 顯示無法執行，開 Terminal 到本資料夾執行一次：

```bash
chmod +x start-app3-mac.command
./start-app3-mac.command
```

## Windows

雙擊 `start-app3-windows.bat`。

## 自動安裝

啟動器會盡量自動檢查並安裝：

- Node.js / npm
- App3 npm dependencies
- Python 視覺 dependencies（Python、ultralytics、opencv-python、numpy、websockets、openai）

本包已內建 `app3/yolov8n.pt` 與 `robot-app/yolov8n.pt`，Windows 沒網路時也不需要臨時下載 YOLO 模型。

## 預設網址

- App3 前端：http://localhost:11503
- App3 bridge：http://localhost:3203
- App3 Robot Display：http://localhost:11503/robot-display.html
- App3 HTTPS pairing display：https://localhost:3443/robot-display.html
