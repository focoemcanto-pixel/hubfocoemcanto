const statusEl = document.getElementById('status');
const toneEl = document.getElementById('tone');
let semitones = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

function render() {
  toneEl.textContent = semitones > 0 ? `+${semitones}` : String(semitones);
}

async function send(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.runtime.sendMessage({ ...message, tabId: tab?.id });
}

document.getElementById('start').addEventListener('click', async () => {
  setStatus('Ativando captura da guia...');
  const response = await send({ type: 'START_CAPTURE', semitones });
  setStatus(response?.message || 'Comando enviado.');
});

document.getElementById('stop').addEventListener('click', async () => {
  const response = await send({ type: 'STOP_CAPTURE' });
  setStatus(response?.message || 'Desligado.');
});

document.getElementById('down').addEventListener('click', async () => {
  semitones = Math.max(-12, semitones - 1);
  render();
  const response = await send({ type: 'SET_TRANSPOSE', semitones });
  setStatus(response?.message || 'Tom atualizado.');
});

document.getElementById('up').addEventListener('click', async () => {
  semitones = Math.min(12, semitones + 1);
  render();
  const response = await send({ type: 'SET_TRANSPOSE', semitones });
  setStatus(response?.message || 'Tom atualizado.');
});

document.getElementById('reset').addEventListener('click', async () => {
  semitones = 0;
  render();
  const response = await send({ type: 'SET_TRANSPOSE', semitones });
  setStatus(response?.message || 'Voltou ao original.');
});

chrome.storage.local.get(['focoTransposeSemitones'], (data) => {
  semitones = Number(data.focoTransposeSemitones || 0);
  render();
});
