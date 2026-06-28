let creatingOffscreen = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Processar áudio capturado da guia ativa para estudo vocal.',
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message || 'Erro inesperado.' }));
  return true;
});

async function handleMessage(message) {
  if (message.type === 'START_CAPTURE') {
    if (!message.tabId) return { ok: false, message: 'Guia ativa não encontrada.' };
    await ensureOffscreen();
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId });
    await chrome.storage.local.set({ focoTransposeSemitones: message.semitones || 0 });
    return chrome.runtime.sendMessage({ type: 'OFFSCREEN_START', streamId, semitones: message.semitones || 0 });
  }

  if (message.type === 'STOP_CAPTURE') {
    await ensureOffscreen();
    return chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
  }

  if (message.type === 'SET_TRANSPOSE') {
    await chrome.storage.local.set({ focoTransposeSemitones: message.semitones || 0 });
    await ensureOffscreen();
    return chrome.runtime.sendMessage({ type: 'OFFSCREEN_SET_TRANSPOSE', semitones: message.semitones || 0 });
  }

  return { ok: false, message: 'Comando desconhecido.' };
}
