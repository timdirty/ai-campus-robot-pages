# App2 校園服務機器人啟動包

## Mac

建議用 Git clone 取得專案，然後雙擊 `start-app2-mac.command`。

如果 macOS 顯示無法執行，開 Terminal 到本資料夾執行一次：

```bash
chmod +x start-app2-mac.command
./start-app2-mac.command
```

## Windows

雙擊 `start-app2-windows.bat`。

## 自動安裝

啟動器會盡量自動檢查並安裝：

- Node.js / npm
- App2 npm dependencies
- Python YOLO dependencies（Python、ultralytics、opencv-python、numpy）

如果系統無法自動安裝 Node.js，啟動器會開啟 Node.js 下載頁。

## 預設網址

- App2 前端：http://localhost:3000
- App2 bridge：http://localhost:3204
- App2 Robot Display：http://localhost:3000/robot-display.html?bridge=localhost:3204
