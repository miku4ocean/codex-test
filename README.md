# codex-test
This is a test repo for Codex

## Slide Capture Assistant (Chrome Extension)
The `extension/` folder contains a Manifest V3 Chrome extension that automates slide pagination, screenshots, and PDF export.

### Features
- Drag-to-select screenshot and "next page" regions directly on the slide page.
- Configurable wait times after clicking next and after each screenshot.
- Uses `chrome.tabs.captureVisibleTab` plus an in-worker cropper to capture only the selected rectangle.
- Accumulates captures and builds a lightweight PDF client-side without external libraries.

### How to use
1. Load the unpacked extension via **chrome://extensions** → **Load unpacked** → select the `extension/` folder.
2. Open the slide deck tab you want to capture.
3. Open the extension popup → click **1) 選取截圖與下一頁區域** and drag to mark the screenshot region, then the next-button region.
4. Adjust wait times if needed and click **2) 開始截圖**. The service worker will repeatedly click next, wait, capture, and crop.
5. Click **停止並下載 PDF** to stop the loop and download a merged PDF of captured pages.

### Notes
- Keep the slide tab visible during capture; `captureVisibleTab` only records the current viewport.
- If the next-button click fails (element missing), capture stops automatically.
- Captured images are kept in memory only; stopping clears them after export.
