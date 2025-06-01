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

// ======================= 2) Referencias al DOM (después de load) =======================
let sidebar, openSidebarBtn, closeSidebarBtn, toggleHistoryBtn;
let queueContainer, queueCountSpan, playQueueBtn;
let historyContainer;
let searchInput, searchBtn, clearResultsBtn, searchingIndicator;
let playerWrapper, statusDiv, stopBtn;
let resultsDiv;
let timerDiv, timerCountSpan;

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar
  sidebar = document.getElementById('sidebar');
  openSidebarBtn = document.getElementById('openSidebarBtn');
  closeSidebarBtn = document.getElementById('closeSidebarBtn');
  toggleHistoryBtn = document.getElementById('toggleHistoryBtn');

  // Cola
  queueContainer = document.getElementById('queue');
  queueCountSpan = document.getElementById('queueCount');
  playQueueBtn = document.getElementById('playQueueBtn');

  // Historial
  historyContainer = document.getElementById('history');

  // Búsqueda
  searchInput = document.getElementById('searchInput');
  searchBtn = document.getElementById('searchBtn');
  clearResultsBtn = document.getElementById('clearResultsBtn');
  searchingIndicator = document.getElementById('searchingIndicator');

  // Player
  playerWrapper = document.getElementById('playerWrapper');
  statusDiv = document.getElementById('status');
  stopBtn = document.getElementById('stopBtn');

  // Resultados
  resultsDiv = document.getElementById('results');

  // Temporizador
  timerDiv = document.getElementById('timer');
  timerCountSpan = document.getElementById('timerCount');

  // Inicializar interacción
  initEventListeners();
  loadHistoryFromCache();
  renderHistory();
  renderQueue();
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

  // Botón “Buscar”
  searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (!query) {
      alert('Escribe algo para buscar en YouTube.');
      return;
    }
    startSearch(query);
  });

  // Botón “Limpiar Resultados”
  clearResultsBtn.addEventListener('click', () => {
    resultsDiv.innerHTML = '';
    hideSearchingIndicator();
    statusDiv.textContent = '🗑 Resultados limpiados.';
    // Volver a mostrar el player si ya estaba reproduciendo
    if (isPlaying) playerWrapper.style.display = 'block';
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
      // Desmarcar cualquier item activo en la cola
      document.querySelectorAll('.queue-item.active').forEach(el => el.classList.remove('active'));
    }
  });
}

// ======================= 4) Mostrar/Ocultar playerWrapper =======================
function showPlayerWrapper() {
  playerWrapper.style.display = 'block';
}
function hidePlayerWrapper() {
  playerWrapper.style.display = 'none';
}

// ======================= 5) Función para iniciar búsqueda =======================
function startSearch(query) {
  // Ocultar playerWrapper para que la búsqueda ocupe todo
  hidePlayerWrapper();
  statusDiv.textContent = `🔍 Buscando "${query}"…`;
  showSearchingIndicator();
  searchOnYouTube(query);
}

function showSearchingIndicator() {
  searchingIndicator.style.display = 'block';
}
function hideSearchingIndicator() {
  searchingIndicator.style.display = 'none';
}

// ======================= 6) YouTube IFrame API invoca esto =======================
function onYouTubeIframeAPIReady() {
  player = new YT.Player('youtubePlayer', {
    height: '360',
    width: '640',
    videoId: '',
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 1,
      origin: window.location.origin,
      iv_load_policy: 3
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
}

function onPlayerReady(event) {
  // No necesitamos hacer nada especial al iniciar
}

// ======================= 7) Detectar fin del video =======================
function onPlayerStateChange(event) {
  // Cuando el video actual finaliza:
  if (event.data === YT.PlayerState.ENDED) {
    // Si hay más en la cola → reproducir siguiente
    if (isPlaying && queue.length > 0) {
      loadNextInQueue();
      return;
    }
    // Si la cola está vacía pero sigue el modo “play” → autoplay related
    if (isPlaying && queue.length === 0 && lastVideoId) {
      fetchAndPlayRelated(lastVideoId);
      return;
    }
    // Si ya no hay nada más → detener
    if (isPlaying && queue.length === 0 && !lastVideoId) {
      isPlaying = false;
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = '✅ La cola terminó. Agrega nuevos videos.';
    }
  }
}

// ======================= 8) Buscar videos (YouTube Data API) =======================
function searchOnYouTube(query) {
  const encodedQuery = encodeURIComponent(query);
  const url =
    'https://www.googleapis.com/youtube/v3/search?part=snippet' +
    '&type=video&maxResults=10' +
    `&key=${YOUTUBE_API_KEY}&q=${encodedQuery}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`YouTube Data API: ${response.status}`);
      return response.json();
    })
    .then(data => {
      // Limpiar resultados previos
      resultsDiv.innerHTML = '';
      hideSearchingIndicator();

      if (!data.items || data.items.length === 0) {
        statusDiv.textContent = `❌ No se encontraron resultados para "${query}".`;
        return;
      }
      statusDiv.textContent = `✅ Resultados para "${query}":`;

      data.items.forEach(item => {
        const videoId = item.id.videoId;
        const title   = item.snippet.title;
        const thumbnail = item.snippet.thumbnails.medium.url;

        // Crear card de resultado
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

        // Al hacer click sobre la card completa → reproducir preview del video
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

// ======================= 9) Preview de video sin añadir a cola =======================
function previewVideo(videoId, title) {
  // Mostrar el player e iniciar reproducción "silenciosa" del preview
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
  // En esta vista previa no modificamos cola ni historial
}

// ======================= 10) Manejo de Cola =======================
function addToQueue(videoId, title) {
  // Evitar duplicados en la cola
  if (queue.some(item => item.videoId === videoId)) {
    alert('Este video ya está en la cola.');
    return;
  }
  queue.push({ videoId, title });
  renderQueue();
  statusDiv.textContent = `📝 Video agregado a la cola: "${title}".`;

  // Habilitar botón “Reproducir Cola” si era la primera vez
  if (queue.length === 1) {
    playQueueBtn.disabled = false;
  }
}

function renderQueue() {
  // Actualizar contador
  queueCountSpan.textContent = queue.length;

  // Limpiar
  const queueDiv = queueContainer.querySelector('div:nth-child(2)'); 
  // (... usamos div:nth-child(2) porque el primer child es el título. Si difiere, simplemente queueContainer.innerHTML = '')
  queueContainer.innerHTML = `<div class="section-title">Cola de reproduc. <span id="queueCount">(${queue.length})</span></div>`;

  queue.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.setAttribute('draggable', 'true');
    div.dataset.index = index;

    // Si este video coincide con lastVideoId y estamos reproduciendo, marcar activo
    if (item.videoId === lastVideoId && isPlaying) {
      div.classList.add('active');
    }

    div.innerHTML = `
      <div class="queue-details">${item.title}</div>
      <div class="queue-actions">
        <button class="btn-remove" title="Eliminar">🗑</button>
      </div>
    `;

    // Click sobre el ítem → reproducir desde aquí
    div.addEventListener('click', () => {
      playFromQueue(index);
    });

    // Botón “Eliminar” dentro del ítem
    const btnRemove = div.querySelector('.btn-remove');
    btnRemove.addEventListener('click', e => {
      e.stopPropagation();
      removeFromQueue(index);
    });

    // Drag & Drop: inicio de arrastre
    div.addEventListener('dragstart', e => {
      div.classList.add('dragging');
      e.dataTransfer.setData('text/plain', index);
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
    });

    // Dragover y drop para reordenar
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

// Elimina un elemento de la cola (índice idx)
function removeFromQueue(idx) {
  const removed = queue.splice(idx, 1)[0];
  renderQueue();
  if (queue.length === 0) {
    playQueueBtn.disabled = true;
  }
  // Si eliminamos el que se estaba reproduciendo, detenemos
  if (removed.videoId === lastVideoId) {
    player.stopVideo();
    isPlaying = false;
    stopBtn.disabled = true;
    playQueueBtn.disabled = false;
    statusDiv.textContent = '🚫 Video en reproducción eliminado. Detenido.';
    lastVideoId = null;
  }
}

// Reproduce un video directamente desde la cola (índice idx)
function playFromQueue(idx) {
  const { videoId, title } = queue[idx];
  // Limpiar marcados anteriores
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

  // Marcar el item actual
  const items = queueContainer.querySelectorAll('.queue-item');
  if (items[idx]) items[idx].classList.add('active');

  addToHistory(videoId, title);
}

// Reproduce el siguiente video en la cola (o autoplay related si la cola se vacía)
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

  // Tomar primer elemento
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

// Reordenar la cola al arrastrar (drag & drop)
function reorderQueue(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const item = queue.splice(fromIdx, 1)[0];
  queue.splice(toIdx, 0, item);
  renderQueue();
}

// ======================= 11) Historial =======================
function addToHistory(videoId, title) {
  const timestamp = new Date().toLocaleTimeString();
  // Evitar duplicados en historial
  historyList = historyList.filter(item => item.videoId !== videoId);
  historyList.unshift({ videoId, title, timestamp });
  if (historyList.length > 30) {
    historyList.pop();
  }
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

// Almacenar historial en localStorage para persistencia
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

// ======================= 12) Cuñas publicitarias =======================
function getRandomInterval() {
  return Math.floor(
    Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)
  ) + MIN_INTERVAL;
}

function scheduleNextCuna() {
  if (!isPlaying) return;
  const intervalo = getRandomInterval();
  // Mostrar temporizador flotante
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

  // Ocultar temporizador mientras suena la cuña
  stopCountdown();

  // Al finalizar la cuña, restaurar volumen y programar siguiente
  cunaAudio.addEventListener('ended', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    if (isPlaying) scheduleNextCuna();
  });
  cunaAudio.addEventListener('error', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    if (isPlaying) scheduleNextCuna();
  });
}

// ======================= 13) Autoplay “Related” =======================
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

// ======================= 14) Temporizador flotante =======================
let countdownInterval = null;
function startCountdown(duration) {
  // duration en ms. Convertir a segundos.
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
