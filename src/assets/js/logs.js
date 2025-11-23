const content = document.getElementById('content');
const fileSpan = document.getElementById('file');
const openBtn = document.getElementById('openFile');
const clearBtn = document.getElementById('clear');
const filePicker = document.getElementById('filePicker');
const searchInput = document.getElementById('search');
const clearSearchBtn = document.getElementById('clearSearch');
const searchCount = document.getElementById('searchCount');

let currentFile = null;
let todayFile = null;
let liveMode = true; // live apenas quando currentFile === todayFile

// buffer de linhas para reduzir reflows
let buffer = [];
let flushScheduled = false;
function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  // usa requestAnimationFrame quando disponível para suavizar
  const schedule = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
  schedule(() => {
    const items = buffer.splice(0, buffer.length);
    for (const line of items) prepend(line);
    flushScheduled = false;
  });
}

function makeLineDiv(line) {
  const div = document.createElement('div');
  const cls = line.includes('[ERROR]') ? 'level-ERROR' : line.includes('[WARN]') ? 'level-WARN' : line.includes('[DEBUG]') ? 'level-DEBUG' : 'level-INFO';
  div.className = cls + ' log-line';
  div.textContent = line.replace(/\n$/, '');
  return div;
}

function prepend(line) {
  const div = makeLineDiv(line);
  if (content.firstChild) content.insertBefore(div, content.firstChild);
  else content.appendChild(div);
}

function setBlockTopFirst(block) {
  if (!block) return;
  const lines = String(block).split(/\r?\n/).filter(Boolean);
  // queremos a primeira linha no topo; então removemos conteúdo e inserimos do fim para o começo? Não.
  // Melhor: limpar e inserir na ordem normal, mas sempre no topo (prepend) invertendo a iteração
  content.innerHTML = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    prepend(lines[i]);
  }
  applySearchFilter();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

function highlight(text, query) {
  if (!query) return escapeHtml(text);
  try {
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return escapeHtml(text).replace(re, m => `<mark class="hl">${escapeHtml(m)}</mark>`);
  } catch {
    return escapeHtml(text);
  }
}

function applySearchFilter() {
  const q = searchInput.value.trim();
  let total = 0;
  let matched = 0;
  const children = Array.from(content.children);
  for (const div of children) {
    if (!div.classList.contains('log-line')) continue;
    total++;
    const text = div.textContent || '';
    if (!q) {
      div.style.display = '';
      if (div.dataset.originalText) {
        div.innerHTML = escapeHtml(div.dataset.originalText);
        delete div.dataset.originalText;
      }
      continue;
    }
    if (text.toLowerCase().includes(q.toLowerCase())) {
      matched++;
      if (!div.dataset.originalText) div.dataset.originalText = text;
      div.innerHTML = highlight(text, q);
      div.style.display = '';
    } else {
      div.style.display = 'none';
    }
  }
  if (q) searchCount.textContent = `${matched} de ${total}`; else searchCount.textContent = '';
}

// Eventos do main
window.logs.onFile((file) => {
  currentFile = file;
  fileSpan.textContent = file;
  liveMode = (todayFile && currentFile === todayFile); // só live se for o arquivo de hoje
});
window.logs.onToday((file) => {
  todayFile = file;
  // se já estamos nele, ativa live
  liveMode = (currentFile === todayFile);
});
window.logs.onLine((line) => {
  if (liveMode) {
    buffer.push(line);
    scheduleFlush();
  }
});
let initializedFor = null;
window.logs.onInitial((text) => {
  // só substitui conteúdo quando trocamos de arquivo pelo select ou na primeira carga
  // evita flicker quando já estamos em live e chegam novas linhas
  setBlockTopFirst(text);
  initializedFor = currentFile;
});
window.logs.onList((list) => {
  filePicker.innerHTML = '';
  for (const f of list) {
    const opt = document.createElement('option');
    opt.value = f.path;
    opt.textContent = f.name;
    filePicker.appendChild(opt);
  }
});

// Ações
openBtn.onclick = () => window.logs.openCurrent();
clearBtn.onclick = () => { content.innerHTML = ''; };
searchInput.oninput = () => applySearchFilter();
clearSearchBtn.onclick = () => { searchInput.value = ''; applySearchFilter(); searchInput.focus(); };
filePicker.onchange = async () => {
  const file = filePicker.value;
  if (!file) return;
  liveMode = (file === todayFile); // só live no arquivo de hoje
  await window.logs.loadFile(file);
};

// Inicialização
(async () => {
  await window.logs.listFiles();
  await window.logs.requestInitial();
})();
