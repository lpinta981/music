// js/player.js

// ========================= 1) API KEY & VARIABLES =========================
const YOUTUBE_API_KEY = 'AIzaSyCT6oq7Y-KcHEGLM4TusqoppYiGzxYgX9s';

let player;                   // Instancia de YT.Player
let isPlaying = false;        // Indica si estamos reproduciendo cola/autoplay
let queue = [];               // Cola: array de { videoId, title }
let randomTimerId = null;     // ID de setTimeout para la próxima cuña
let cunaAudio = null;         // Elemento <audio> de la cuña
let lastVideoId = null;       // ID del último video reproducido (para Related)

let historyList = [];         // Lista de últimos 30 reproducidos: { videoId, title, timestamp }

const cunas = [
  'assets/cunas/cuna1.mp3',
  'assets/cunas/cuna2.mp3',
  'assets/cunas/cuna3.mp3'
];

// Intervalos aleatorios en milisegundos (30 s – 5 min)
const MIN_INTERVAL = 30 * 1000;
const MAX_INTERVAL = 5 * 60 * 1000;

// ======================= 2) Referencias al DOM =======================
let sidebar, openSidebarBtn, closeSidebarBtn, toggleHistoryBtn;
let queueContainer, queueCountSpan, playQueueBtn;
let historyContainer;
let searchInput, searchBtn, toggleResultsBtn, searchingIndicator;
let playerWrapper, statusDiv, stopBtn;
let resultsDiv;
let timerDiv, timerCountSpan;

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar
  sidebar            = document.getElementById('sidebar');
  openSidebarBtn     = document.getElementById('openSidebarBtn');
  closeSidebarBtn    = document.getElementById('closeSidebarBtn');
  toggleHistoryBtn   = document.getElementById('toggleHistoryBtn');

  // Cola
  queueContainer     = document.getElementById('queue');
  queueCountSpan     = document.getElementById('queueCount');
  playQueueBtn       = document.getElementById('playQueueBtn');

  // Historial
  historyContainer   = document.getElementById('history');

  // Búsqueda
  searchInput        = document.getElementById('searchInput');
  searchBtn          = document.getElementById('searchBtn');
  toggleResultsBtn   = document.getElementById('toggleResultsBtn');
  searchingIndicator = document.getElementById('searchingIndicator');

  // Player
  playerWrapper      = document.getElementById('playerWrapper');
  statusDiv          = document.getElementById('status');
  stopBtn            = document.getElementById('stopBtn');

  // Resultados
  resultsDiv         = document.getElementById('results');

  // Temporizador
  timerDiv           = document.getElementById('timer');
  timerCountSpan     = document.getElementById('timerCount');

  // Inicializar interacciones y estado
  initEventListeners();
  loadHistoryFromCache();
  renderHistory();
  renderQueue();
  startCountdown();  // El temporizador de cuñas arranca inmediatamente
});

// ======================= 3) Inicializar manejadores de eventos =======================
function initEventListeners() {
  // Abrir/cerrar sidebar
  openSidebarBtn.addEventListener('click', () => {
    sidebar.classList.remove('closed');
  });
  closeSidebarBtn.addEventListener('click', () => {
    sidebar.classList.add('closed');
  });

  // Toggle historial (en móvil)
  toggleHistoryBtn.addEventListener('click', () => {
    historyContainer.parentElement.classList.toggle('closed');
  });

  // Botón “Buscar” y Enter en campo de búsqueda
  searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (!query) {
      alert('Escribe algo para buscar en YouTube.');
      return;
    }
    startSearch(query);
  });
  searchInput.addEventListener('keyup', e => {
    if (e.key === 'Enter') {
      searchBtn.click();
    }
  });

  // Botón “Mostrar Resultados”
  toggleResultsBtn.addEventListener('click', () => {
    if (resultsDiv.style.display === 'none' || resultsDiv.style.display === '') {
      resultsDiv.style.display = 'grid';
    } else {
      resultsDiv.style.display = 'none';
    }
  });

  // Botón “Reproducir Cola”
  playQueueBtn.addEventListener('click', () => {
    if (!isPlaying && queue.length > 0) {
      isPlaying = true;
      playQueueBtn.disabled = true;
      statusDiv.textContent = '▶️ Reproduciendo cola…';
      showPlayerWrapper();
      loadNextInQueue();
      scheduleNextCuna();
    }
  });

  // Botón “Detener Todo”
  stopBtn.addEventListener('click', () => {
    if (isPlaying) {
      isPlaying = false;
      clearTimeout(randomTimerId);
      if (cunaAudio) cunaAudio.pause();
      player.stopVideo();
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = 'Estado: detenido';
      // Desmarcar .active en cola si existiera
      document.querySelectorAll('.queue-item.active').forEach(el => el.classList.remove('active'));
    }
  });
}

// ======================= 4) Mostrar/Ocultar elementos =======================
function showPlayerWrapper() {
  playerWrapper.style.display = 'block';
}
function hidePlayerWrapper() {
  playerWrapper.style.display = 'none';
}
function showResults() {
  resultsDiv.style.display = 'grid';
}
function hideResults() {
  resultsDiv.style.display = 'none';
}
// No ocultamos la reproducción si se esconde el playerWrapper, 
// porque así mantenemos la música sonando.

function showSearchingIndicator() {
  searchingIndicator.style.display = 'block';
}
function hideSearchingIndicator() {
  searchingIndicator.style.display = 'none';
}

// ======================= 5) Buscar videos en YouTube =======================
function startSearch(query) {
  hidePlayerWrapper();
  hideResults();
  statusDiv.textContent = `🔍 Buscando "${query}"…`;
  showSearchingIndicator();
  searchOnYouTube(query);
}

function searchOnYouTube(query) {
  const encodedQuery = encodeURIComponent(query);
  const url =
    'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10' +
    `&key=${YOUTUBE_API_KEY}&q=${encodedQuery}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`YouTube Data API: ${response.status}`);
      return response.json();
    })
    .then(data => {
      hideSearchingIndicator();
      resultsDiv.innerHTML = '';
      showResults();

      if (!data.items || data.items.length === 0) {
        statusDiv.textContent = `❌ No se encontraron resultados para "${query}".`;
        return;
      }
      statusDiv.textContent = `✅ Resultados para "${query}":`;

      data.items.forEach(item => {
        const videoId = item.id.videoId;
        const title   = item.snippet.title;
        const thumbnail = item.snippet.thumbnails.medium.url;

        // Crear tarjeta de resultado
        const card = document.createElement('div');
        card.className = 'result-item';
        card.innerHTML = `
          <img class="result-thumb" src="${thumbnail}" alt="Miniatura">
          <div class="result-info">
            <div class="result-title">${title}</div>
          </div>
          <button class="result-add-btn" title="Añadir a cola">+</button>
        `;

        // Botón “+” para agregar a la cola
        const btnAdd = card.querySelector('.result-add-btn');
        btnAdd.addEventListener('click', e => {
          e.stopPropagation();
          addToQueue(videoId, title);
        });

        // Click sobre la card completa → vista previa (preview)
        card.addEventListener('click', () => {
          previewVideo(videoId, title);
        });

        resultsDiv.appendChild(card);
      });
    })
    .catch(err => {
      console.error(err);
      hideSearchingIndicator();
      statusDiv.textContent = `⚠️ Error al buscar: ${err.message}`;
    });
}

// ======================= 6) Preview de un video =======================
function previewVideo(videoId, title) {
  showPlayerWrapper();
  player.mute();
  player.loadVideoById({ videoId, suggestedQuality: 'default' });
  player.playVideo();
  setTimeout(() => {
    player.unMute();
    player.setVolume(100);
  }, 200);

  statusDiv.textContent = `🔎 Vista previa: ${title}`;
  stopBtn.disabled = false;
  // No agregamos ni a la cola ni al historial en la vista previa
}

// ======================= 7) Manejo de la Cola =======================
function addToQueue(videoId, title) {
  if (queue.some(item => item.videoId === videoId)) {
    alert('Este video ya está en la cola.');
    return;
  }
  queue.push({ videoId, title });
  renderQueue();
  statusDiv.textContent = `📝 Video agregado a la cola: "${title}".`;

  if (queue.length === 1) {
    playQueueBtn.disabled = false;
  }
}

function renderQueue() {
  // Actualizar contador
  queueCountSpan.textContent = queue.length;

  // Reconstruir todo el contenedor de cola
  queueContainer.innerHTML = `
    <div class="section-title">
      Cola de reproduc. <span id="queueCount">(${queue.length})</span>
    </div>
  `;

  queue.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.setAttribute('draggable', 'true');
    div.dataset.index = index;

    if (item.videoId === lastVideoId && isPlaying) {
      div.classList.add('active');
    }

    div.innerHTML = `
      <div class="queue-details">${item.title}</div>
      <div class="queue-actions">
        <button class="btn-remove" title="Eliminar">🗑</button>
      </div>
    `;

    // Click en entire queue-item → reproducir desde aquí
    div.addEventListener('click', () => {
      playFromQueue(index);
    });

    // Botón “Eliminar”
    const btnRemove = div.querySelector('.btn-remove');
    btnRemove.addEventListener('click', e => {
      e.stopPropagation();
      removeFromQueue(index);
    });

    // Drag & Drop
    div.addEventListener('dragstart', e => {
      div.classList.add('dragging');
      e.dataTransfer.setData('text/plain', index);
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
    });
    div.addEventListener('dragover', e => {
      e.preventDefault();
      div.style.border = '2px dashed #aaa';
    });
    div.addEventListener('dragleave', () => {
      div.style.border = '';
    });
    div.addEventListener('drop', e => {
      e.preventDefault();
      div.style.border = '';
      const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const targetIndex = index;
      reorderQueue(draggedIndex, targetIndex);
    });

    queueContainer.appendChild(div);
  });
}

function removeFromQueue(idx) {
  const removed = queue.splice(idx, 1)[0];
  renderQueue();
  if (queue.length === 0) {
    playQueueBtn.disabled = true;
  }
  if (removed.videoId === lastVideoId) {
    player.stopVideo();
    isPlaying = false;
    stopBtn.disabled = true;
    playQueueBtn.disabled = false;
    statusDiv.textContent = '🚫 Video en reproducción eliminado. Detenido.';
    lastVideoId = null;
  }
}

function playFromQueue(idx) {
  const { videoId, title } = queue[idx];
  document.querySelectorAll('.queue-item.active').forEach(el => el.classList.remove('active'));

  isPlaying = true;
  lastVideoId = videoId;
  player.mute();
  player.loadVideoById({ videoId, suggestedQuality: 'default' });
  player.playVideo();

  setTimeout(() => {
    player.unMute();
    player.setVolume(100);
  }, 200);

  statusDiv.textContent = `▶️ Reproduciendo: ${title}`;
  stopBtn.disabled = false;
  playQueueBtn.disabled = true;

  const items = queueContainer.querySelectorAll('.queue-item');
  if (items[idx]) items[idx].classList.add('active');

  addToHistory(videoId, title);
}

function loadNextInQueue() {
  if (queue.length === 0) {
    if (lastVideoId) {
      fetchAndPlayRelated(lastVideoId);
    } else {
      isPlaying = false;
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = '✅ Cola vacía. Agrega nuevos videos.';
    }
    renderQueue();
    return;
  }

  const next = queue.shift();
  const { videoId, title } = next;
  lastVideoId = videoId;

  player.mute();
  player.loadVideoById({ videoId, suggestedQuality: 'default' });
  player.playVideo();

  statusDiv.textContent = `▶️ Reproduciendo: ${title} (Quedan ${queue.length})`;
  setTimeout(() => {
    player.unMute();
    player.setVolume(100);
  }, 200);

  renderQueue();
  playQueueBtn.disabled = true;
  stopBtn.disabled = false;
  addToHistory(videoId, title);
  scheduleNextCuna();
}

function reorderQueue(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const item = queue.splice(fromIdx, 1)[0];
  queue.splice(toIdx, 0, item);
  renderQueue();
}

// ======================= 8) Historial de últimos 30 videos =======================
function addToHistory(videoId, title) {
  const timestamp = new Date().toLocaleTimeString();
  historyList = historyList.filter(item => item.videoId !== videoId);
  historyList.unshift({ videoId, title, timestamp });
  if (historyList.length > 30) historyList.pop();
  saveHistoryToCache();
  renderHistory();
}

function renderHistory() {
  historyContainer.innerHTML = `<div class="section-title">Historial (últimos 30)</div>`;
  historyList.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.dataset.index = idx;
    div.innerHTML = `
      <div class="history-details">${item.title}</div>
      <div class="history-time">${item.timestamp}</div>
    `;
    div.addEventListener('click', () => {
      playFromHistory(idx);
    });
    historyContainer.appendChild(div);
  });
}

function playFromHistory(idx) {
  const { videoId, title } = historyList[idx];
  player.mute();
  player.loadVideoById({ videoId, suggestedQuality: 'default' });
  player.playVideo();
  setTimeout(() => {
    player.unMute();
    player.setVolume(100);
  }, 200);

  statusDiv.textContent = `▶️ Reproduciendo historial: ${title}`;
  stopBtn.disabled = false;
  playQueueBtn.disabled = true;
  isPlaying = true;
  lastVideoId = videoId;
  addToHistory(videoId, title);
  scheduleNextCuna();
}

function saveHistoryToCache() {
  try {
    localStorage.setItem('yt_history', JSON.stringify(historyList));
  } catch (e) {
    console.warn('No se pudo guardar historial en localStorage', e);
  }
}
function loadHistoryFromCache() {
  try {
    const data = localStorage.getItem('yt_history');
    if (data) {
      historyList = JSON.parse(data);
      if (!Array.isArray(historyList)) historyList = [];
    }
  } catch (e) {
    console.warn('No se pudo cargar historial de localStorage', e);
    historyList = [];
  }
}

// ======================= 9) Cuñas publicitarias =======================
function getRandomInterval() {
  return Math.floor(
    Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)
  ) + MIN_INTERVAL;
}

let countdownInterval = null;
function scheduleNextCuna() {
  clearInterval(countdownInterval);
  stopCountdown();
  if (!isPlaying) return;

  const intervalo = getRandomInterval();
  startCountdown(intervalo);
  randomTimerId = setTimeout(() => {
    playCuna();
  }, intervalo);
}

function playCuna() {
  if (!isPlaying) return;
  statusDiv.textContent = '🔊 Reproduciendo cuña publicitaria…';
  player.setVolume(20);

  // Elegir cuña al azar
  const cunaUrl = cunas[Math.floor(Math.random() * cunas.length)];
  cunaAudio = new Audio(cunaUrl);
  cunaAudio.volume = 1.0;
  cunaAudio.play();

  stopCountdown();

  cunaAudio.addEventListener('ended', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    scheduleNextCuna();
  });
  cunaAudio.addEventListener('error', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    scheduleNextCuna();
  });
}

// ======================= 10) Autoplay “Related” =======================
function fetchAndPlayRelated(videoId) {
  if (!videoId) {
    isPlaying = false;
    playQueueBtn.disabled = false;
    stopBtn.disabled = true;
    statusDiv.textContent = '❌ No hay video previo para buscar relacionado.';
    return;
  }
  statusDiv.textContent = '🔍 Buscando video relacionado…';

  const url =
    'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1' +
    `&relatedToVideoId=${encodeURIComponent(videoId)}` +
    `&key=${YOUTUBE_API_KEY}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`YouTube Data API (related): ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (data.items && data.items.length > 0 && data.items[0].id.videoId) {
        const newVideoId = data.items[0].id.videoId;
        const newTitle = data.items[0].snippet.title || 'Video Relacionado';

        lastVideoId = newVideoId;
        player.mute();
        player.loadVideoById({ videoId: newVideoId, suggestedQuality: 'default' });
        player.playVideo();

        statusDiv.textContent = `▶️ Reproduciendo relacionado: ${newTitle}`;
        playQueueBtn.disabled = true;
        stopBtn.disabled = false;

        setTimeout(() => {
          player.unMute();
          player.setVolume(100);
        }, 200);

        addToHistory(newVideoId, newTitle);
        scheduleNextCuna();
      } else {
        statusDiv.textContent = '❌ No se encontró ningún video relacionado. Fin de reproducción.';
        isPlaying = false;
        playQueueBtn.disabled = false;
        stopBtn.disabled = true;
      }
    })
    .catch(err => {
      console.error(err);
      statusDiv.textContent = `⚠️ Error buscando relacionado: ${err.message}`;
      isPlaying = false;
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
    });
}

// ======================= 11) Temporizador flotante para cuñas =======================
function startCountdown(duration = getRandomInterval()) {
  let remaining = Math.ceil(duration / 1000);
  timerDiv.style.display = 'block';
  updateTimerText(remaining);

  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      timerDiv.style.display = 'none';
    } else {
      updateTimerText(remaining);
    }
  }, 1000);
}

function updateTimerText(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  timerCountSpan.textContent = `${mm}:${ss}`;
}

function stopCountdown() {
  clearInterval(countdownInterval);
  timerDiv.style.display = 'none';
}
