function $(id) {
  return document.getElementById(id);
}

const statusEl = $('status');
const countEl = $('count');
const waitClickEl = $('wait-click');
const waitShotEl = $('wait-shot');

async function selectAreas() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const coords = await chrome.tabs.sendMessage(tab.id, { type: 'selectAreas' });
  if (!coords) return;
  await chrome.runtime.sendMessage({
    type: 'saveSelection',
    captureRegion: coords.captureRegion,
    nextButtonRect: coords.nextButtonRect,
    devicePixelRatio: coords.devicePixelRatio,
    waitAfterClickMs: Number(waitClickEl.value) * 1000,
    waitAfterScreenshotMs: Number(waitShotEl.value) * 1000
  });
  statusEl.textContent = '已儲存選取';
}

async function startCapture() {
  const response = await chrome.runtime.sendMessage({ type: 'startCapture' });
  if (!response?.ok) {
    statusEl.textContent = response?.error || '無法開始';
  } else {
    statusEl.textContent = 'running';
  }
}

async function stopCapture() {
  const response = await chrome.runtime.sendMessage({ type: 'stopCapture' });
  statusEl.textContent = 'stopped';
  if (response?.images?.length) {
    const blob = await buildPdf(response.images);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slides.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }
  countEl.textContent = String(response?.images?.length || 0);
}

function listenStatus() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'status') {
      statusEl.textContent = msg.status;
    }
  });
}

async function loadState() {
  const state = await chrome.runtime.sendMessage({ type: 'getState' });
  if (state.waitAfterClickMs) {
    waitClickEl.value = state.waitAfterClickMs / 1000;
  }
  if (state.waitAfterScreenshotMs) {
    waitShotEl.value = state.waitAfterScreenshotMs / 1000;
  }
  if (state.capturing) {
    statusEl.textContent = 'running';
  }
  countEl.textContent = String(state.images?.length || 0);
}

async function dataUrlToJpeg(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const jpegBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  const buffer = await jpegBlob.arrayBuffer();
  return { bytes: new Uint8Array(buffer), width: bitmap.width, height: bitmap.height };
}

function utf8Encode(str) {
  return new TextEncoder().encode(str);
}

function addObject(parts, offsets, contentParts) {
  const id = offsets.length + 1;
  const prefix = `${id} 0 obj\n`;
  let size = utf8Encode(prefix).length;
  const bodyParts = [];
  for (const part of contentParts) {
    if (typeof part === 'string') {
      const encoded = utf8Encode(part);
      bodyParts.push(encoded);
      size += encoded.length;
    } else {
      bodyParts.push(part);
      size += part.length;
    }
  }
  const suffix = `\nendobj\n`;
  const suffixBytes = utf8Encode(suffix);
  size += suffixBytes.length;

  const offset = parts.reduce((acc, p) => acc + p.length, 0);
  offsets.push(offset);
  parts.push(utf8Encode(prefix), ...bodyParts, suffixBytes);
  return id;
}

function buildPdfObjects(pages) {
  const parts = [utf8Encode('%PDF-1.4\n%âãÏÓ\n')];
  const offsets = [];
  const pageIds = [];
  const contentIds = [];
  const imageIds = [];

  pages.forEach((page, index) => {
    const imgId = addObject(parts, offsets, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      page.bytes,
      '\nendstream\n'
    ]);

    const content = `q ${page.width} 0 0 ${page.height} 0 0 cm /Im${imgId} Do Q`;
    const contentId = addObject(parts, offsets, [
      `<< /Length ${utf8Encode(content).length} >>\nstream\n`,
      content,
      '\nendstream\n'
    ]);

    const pageId = addObject(parts, offsets, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im${imgId} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\n`
    ]);

    pageIds.push(pageId);
    contentIds.push(contentId);
    imageIds.push(imgId);
  });

  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const pagesId = addObject(parts, offsets, [
    `<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>\n`
  ]);
  const catalogId = addObject(parts, offsets, [
    `<< /Type /Catalog /Pages ${pagesId} 0 R >>\n`
  ]);

  return { parts, offsets, catalogId };
}

function buildXref(parts, offsets) {
  const total = offsets.length;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  const startxref = parts.reduce((acc, p) => acc + p.length, 0);
  return { xref, startxref };
}

async function buildPdf(images) {
  const jpegPages = [];
  for (const img of images) {
    jpegPages.push(await dataUrlToJpeg(img));
  }
  const { parts, offsets, catalogId } = buildPdfObjects(jpegPages);
  const { xref, startxref } = buildXref(parts, offsets);
  const trailer = `trailer\n<< /Size ${offsets.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  parts.push(utf8Encode(xref), utf8Encode(trailer));
  return new Blob(parts, { type: 'application/pdf' });
}

$('select').addEventListener('click', selectAreas);
$('start').addEventListener('click', startCapture);
$('stop').addEventListener('click', stopCapture);

listenStatus();
loadState();
