const SELECTION_COLORS = {
  capture: 'rgba(0, 128, 255, 0.35)',
  next: 'rgba(0, 200, 120, 0.35)'
};

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'slide-capture-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2147483647',
    cursor: 'crosshair'
  });
  return overlay;
}

function normalizeRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  return { x, y, width, height };
}

function selectRegion(color) {
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const info = document.createElement('div');
    info.textContent = '拖曳以選取區域，放開滑鼠完成。';
    Object.assign(info.style, {
      position: 'fixed',
      top: '10px',
      left: '10px',
      padding: '8px 12px',
      background: '#111',
      color: '#fff',
      fontSize: '14px',
      borderRadius: '4px',
      zIndex: '2147483648'
    });

    let startPoint = null;
    let currentBox = null;

    function cleanup(rect) {
      overlay.removeEventListener('mousedown', onMouseDown);
      overlay.removeEventListener('mousemove', onMouseMove);
      overlay.removeEventListener('mouseup', onMouseUp);
      document.body.removeChild(overlay);
      document.body.removeChild(info);
      resolve(rect);
    }

    function onMouseDown(e) {
      startPoint = { x: e.clientX, y: e.clientY };
      currentBox = document.createElement('div');
      Object.assign(currentBox.style, {
        position: 'absolute',
        border: '2px solid #fff',
        background: color,
        opacity: '0.5'
      });
      overlay.appendChild(currentBox);
    }

    function onMouseMove(e) {
      if (!startPoint || !currentBox) return;
      const rect = normalizeRect(startPoint, { x: e.clientX, y: e.clientY });
      Object.assign(currentBox.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      });
    }

    function onMouseUp(e) {
      if (!startPoint || !currentBox) return;
      const rect = normalizeRect(startPoint, { x: e.clientX, y: e.clientY });
      cleanup(rect);
    }

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);

    document.body.appendChild(overlay);
    document.body.appendChild(info);
  });
}

async function selectAreas() {
  const captureRegion = await selectRegion(SELECTION_COLORS.capture);
  const nextButtonRect = await selectRegion(SELECTION_COLORS.next);
  return { captureRegion, nextButtonRect };
}

function performClick(rect) {
  if (!rect) return false;
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const el = document.elementFromPoint(x, y);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'selectAreas') {
    selectAreas().then((result) => sendResponse(result));
    return true;
  }
  if (message.type === 'performClick') {
    chrome.storage.local.get(['nextButtonRect']).then((data) => {
      const success = performClick(data.nextButtonRect || message.nextButtonRect);
      sendResponse({ success });
    });
    return true;
  }
  return false;
});
