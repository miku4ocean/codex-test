const STATE = {
  capturing: false,
  captureRegion: null,
  nextButtonRect: null,
  devicePixelRatio: 1,
  waitAfterClickMs: 3000,
  waitAfterScreenshotMs: 3000,
  images: []
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cropImage(dataUrl, region) {
  if (!region) return dataUrl;
  const scale = STATE.devicePixelRatio || 1;
  const scaled = {
    x: Math.round(region.x * scale),
    y: Math.round(region.y * scale),
    width: Math.round(region.width * scale),
    height: Math.round(region.height * scale)
  };
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = new OffscreenCanvas(scaled.width, scaled.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    bitmap,
    scaled.x,
    scaled.y,
    scaled.width,
    scaled.height,
    0,
    0,
    scaled.width,
    scaled.height
  );
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function performClick(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { type: 'performClick' });
  return response && response.success;
}

async function captureStep(tabId) {
  if (!STATE.capturing) return false;
  const clickOk = await performClick(tabId);
  if (!clickOk) {
    return false;
  }
  await delay(STATE.waitAfterClickMs);
  if (!STATE.capturing) return false;
  const shot = await chrome.tabs.captureVisibleTab({ format: 'png' });
  const cropped = await cropImage(shot, STATE.captureRegion);
  STATE.images.push(cropped);
  await delay(STATE.waitAfterScreenshotMs);
  return true;
}

async function runCapture(tabId) {
  STATE.capturing = true;
  chrome.runtime.sendMessage({ type: 'status', status: 'running' });
  while (STATE.capturing) {
    const ok = await captureStep(tabId);
    if (!ok || !STATE.capturing) {
      break;
    }
  }
  STATE.capturing = false;
  chrome.runtime.sendMessage({ type: 'status', status: 'stopped' });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'saveSelection') {
    STATE.captureRegion = message.captureRegion;
    STATE.nextButtonRect = message.nextButtonRect;
    STATE.devicePixelRatio = message.devicePixelRatio || 1;
    STATE.waitAfterClickMs = message.waitAfterClickMs ?? STATE.waitAfterClickMs;
    STATE.waitAfterScreenshotMs = message.waitAfterScreenshotMs ?? STATE.waitAfterScreenshotMs;
    STATE.images = [];
    chrome.storage.local.set({
      captureRegion: STATE.captureRegion,
      nextButtonRect: STATE.nextButtonRect,
      devicePixelRatio: STATE.devicePixelRatio,
      waitAfterClickMs: STATE.waitAfterClickMs,
      waitAfterScreenshotMs: STATE.waitAfterScreenshotMs
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'startCapture') {
    if (!STATE.captureRegion || !STATE.nextButtonRect) {
      sendResponse({ ok: false, error: 'No selection defined' });
      return true;
    }
    if (STATE.capturing) {
      sendResponse({ ok: false, error: 'Already capturing' });
      return true;
    }
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]) {
        runCapture(tabs[0].id);
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'stopCapture') {
    STATE.capturing = false;
    sendResponse({ ok: true, images: STATE.images });
    return true;
  }

  if (message.type === 'getState') {
    chrome.storage.local.get([
      'captureRegion',
      'nextButtonRect',
      'devicePixelRatio',
      'waitAfterClickMs',
      'waitAfterScreenshotMs'
    ]).then((data) => {
      STATE.captureRegion = data.captureRegion || STATE.captureRegion;
      STATE.nextButtonRect = data.nextButtonRect || STATE.nextButtonRect;
      STATE.devicePixelRatio = data.devicePixelRatio || STATE.devicePixelRatio;
      STATE.waitAfterClickMs = data.waitAfterClickMs ?? STATE.waitAfterClickMs;
      STATE.waitAfterScreenshotMs = data.waitAfterScreenshotMs ?? STATE.waitAfterScreenshotMs;
      sendResponse({
        captureRegion: STATE.captureRegion,
        nextButtonRect: STATE.nextButtonRect,
        devicePixelRatio: STATE.devicePixelRatio,
        waitAfterClickMs: STATE.waitAfterClickMs,
        waitAfterScreenshotMs: STATE.waitAfterScreenshotMs,
        capturing: STATE.capturing,
        images: STATE.images
      });
    });
    return true;
  }

  return false;
});
