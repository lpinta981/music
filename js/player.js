// =============================================
//  js/player.js
//  Código completo para reproducción de YouTube + cola + historial + cuñas dinámicas
//  (Modificado para que durante la cuña el video se baje a 0% y la cuña permanezca a volumen 100%)
// =============================================

// ========================= 1) API KEY & VARIABLES =========================
const YOUTUBE_API_KEY = 'AIzaSyCT6oq7Y-KcHEGLM4TusqoppYiGzxYgX9s';

let player = null;            // Instancia de YT.Player
let isPlayerReady = false;    // Se vuelve true en onPlayerReady
let isPlaying = false;        // Indica si estamos reproduciendo cola/autoplay
let queue = [];               // Cola: array de { videoId, title }
let randomTimerId = null;     // ID de setTimeout para la próxima cuña
let cunaAudio = null;         // Elemento <audio> de la cuña
let lastVideoId = null;       // ID del último video reproducido (para Related)

let historyList = [];         // Lista de últimos 30 reproducidos: { videoId, title, timestamp }
const pendingActions = [];    // Cola para acciones pendientes de reproducción

// Intervalos aleatorios en milisegundos (30 s – 5 min)
const MIN_INTERVAL = 30 * 1000;       // 30 segundos en milisegundos
const MAX_INTERVAL = 5 * 60 * 1000;   // 5 minutos en milisegundos

// Arreglo de cuñas (se llenará dinámicamente en loadCunas())
let cunas = [];

// ======================= 2) loadCunas() =======================
/**
 * loadCunas(): detecta cuántos archivos cunaX.mp3 existen en assets/cunas
 * y rellena el arreglo global `cunas` con sus URLs.
 *
 * Usa fetch HEAD para preguntarle al servidor si el archivo existe (status 200)
 * o no (status 404). Se detiene en cuanto encuentra un 404 o error de red.
 */
async function loadCunas() {
  const temp = [];
  let i = 1;
  while (true) {
    const url = `assets/cunas/cuna${i}.mp3`;
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      if (!resp.ok) break;
      temp.push(url);
      i++;
    } catch (err) {
      break;
    }
  }
  cunas = temp;
}

// ======================= 3) REFERENCIAS AL DOM =======================
let queueContainer, queueCountSpan, playQueueBtn;
let historyContainer;

let centeredSearch, searchInputCS, searchBtnCS, toggleHistoryBtnCS;
let header, searchInputTop, searchBtnTop, toggleResultsBtn, searchingIndicator, toggleHistoryBtnTop;

let playerWrapper, statusDiv, stopBtn;
let resultsDiv;
let timerDiv, timerCountSpan;

// ======================= 4) FUNCIONES SHOW/HIDE =======================
function showPlayerWrapper() {
  if (playerWrapper) playerWrapper.style.display = 'block';
}
function hidePlayerWrapper() {
  if (playerWrapper) playerWrapper.style.display = 'none';
}
function showResults() {
  if (resultsDiv) resultsDiv.style.display = 'grid';
}
function hideResults() {
  if (resultsDiv) resultsDiv.style.display = 'none';
}
function showSearchingIndicator() {
  if (searchingIndicator) searchingIndicator.style.display = 'block';
}
function hideSearchingIndicator() {
  if (searchingIndicator) searchingIndicator.style.display = 'none';
}
function showCenteredSearch() {
  if (centeredSearch) centeredSearch.style.display = 'flex';
}
function hideCenteredSearch() {
  if (centeredSearch) centeredSearch.style.display = 'none';
}
function showHeader() {
  if (header) header.style.display = 'flex';
}
function hideHeader() {
  if (header) header.style.display = 'none';
}

// ======================= 5) INICIALIZAR EVENT LISTENERS =======================
document.addEventListener('DOMContentLoaded', async () => {
  // Sidebar
  queueContainer     = document.getElementById('queue');
  queueCountSpan     = document.getElementById('queueCount');
  playQueueBtn       = document.getElementById('playQueueBtn');
  historyContainer   = document.getElementById('history');

  // Vista centrada
  centeredSearch     = document.getElementById('centeredSearch');
  searchInputCS      = document.getElementById('searchInput');
  searchBtnCS        = document.getElementById('searchBtn');
  toggleHistoryBtnCS = document.getElementById('toggleHistoryBtn');

  // Header superior
  header             = document.getElementById('header');
  searchInputTop     = document.getElementById('searchInputTop');
  searchBtnTop       = document.getElementById('searchBtnTop');
  toggleResultsBtn   = document.getElementById('toggleResultsBtn');
  searchingIndicator = document.getElementById('searchingIndicator');
  toggleHistoryBtnTop= document.getElementById('toggleHistoryBtnTop');

  // Player
  playerWrapper = document.getElementById('playerWrapper');
  statusDiv     = document.getElementById('status');
  stopBtn       = document.getElementById('stopBtn');

  // Resultados
  resultsDiv    = document.getElementById('results');

  // Temporizador
  timerDiv      = document.getElementById('timer');
  timerCountSpan= document.getElementById('timerCount');

  // Agregar listeners
  initEventListeners();

  // Cargar historial de localStorage y renderizar
  loadHistoryFromCache();
  renderHistory();

  // Renderizar cola (inicialmente vacía)
  renderQueue();

  // Cargar dinámicamente las cuñas antes de arrancar el temporizador
  await loadCunas();

  // El temporizador de cuñas arranca inmediatamente
  startCountdown();
});

function initEventListeners() {
  // Vista centrada: Botón “Buscar”
  searchBtnCS.addEventListener('click', () => {
    const query = searchInputCS.value.trim();
    if (!query) {
      alert('Escribe algo para buscar en YouTube.');
      return;
    }
    doSearchFromCenter(query);
  });
  searchInputCS.addEventListener('keyup', e => {
    if (e.key === 'Enter') searchBtnCS.click();
  });
  toggleHistoryBtnCS.addEventListener('click', () => {
    historyContainer.parentElement.classList.toggle('closed');
  });

  // Header superior: Botón “Buscar”
  searchBtnTop.addEventListener('click', () => {
    const query = searchInputTop.value.trim();
    if (!query) {
      alert('Escribe algo para buscar en YouTube.');
      return;
    }
    doSearch(query);
  });
  searchInputTop.addEventListener('keyup', e => {
    if (e.key === 'Enter') searchBtnTop.click();
  });

  // Botón “Mostrar Resultados”
  toggleResultsBtn.addEventListener('click', () => {
    if (!resultsDiv) return;
    if (resultsDiv.style.display === 'none' || resultsDiv.style.display === '') {
      showResults();
      hidePlayerWrapper();
    } else {
      hideResults();
      if (isPlaying) showPlayerWrapper();
    }
  });

  // Botón “Historial” en header (móvil)
  toggleHistoryBtnTop.addEventListener('click', () => {
    historyContainer.parentElement.classList.toggle('closed');
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
      if (cunaAudio) {
        cunaAudio.pause();
        cunaAudio = null;
      }
      if (player && isPlayerReady) player.stopVideo();
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = 'Estado: detenido';
      document.querySelectorAll('.queue-item.active').forEach(el => el.classList.remove('active'));
      stopCountdown();
    }
  });
}

// ======================= 6) MANEJO DE BÚSQUEDAS =======================
// Función para buscar desde la vista centrada
function doSearchFromCenter(query) {
  hideCenteredSearch();
  showHeader();
  hidePlayerWrapper();
  hideResults();
  statusDiv.textContent = `🔍 Buscando "${query}"…`;
  showSearchingIndicator();
  searchOnYouTube(query);
}

// Función para buscar desde el header
function doSearch(query) {
  hidePlayerWrapper();
  hideResults();
  statusDiv.textContent = `🔍 Buscando "${query}"…`;
  showSearchingIndicator();
  searchOnYouTube(query);
}

// ======================= 7) YouTube IFrame API =======================
// Esta función la invoca la propia API de YouTube una vez que carga el <script>
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
      onReady: () => {
        isPlayerReady = true;
        // Ejecutar todas las acciones pendientes
        while (pendingActions.length > 0) {
          const fn = pendingActions.shift();
          fn();
        }
      },
      onStateChange: onPlayerStateChange
    }
  });
}

// Detecta cuando el video actual termina
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    if (isPlaying && queue.length > 0) {
      loadNextInQueue();
      return;
    }
    if (isPlaying && queue.length === 0 && lastVideoId) {
      fetchAndPlayRelated(lastVideoId);
      return;
    }
    if (isPlaying && queue.length === 0 && !lastVideoId) {
      isPlaying = false;
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = '✅ Cola vacía. Agrega nuevos videos.';
    }
  }
}

// ======================= 8) BÚSQUEDA EN YOUTUBE =======================
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
        card.setAttribute('data-videoid', videoId);
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

        // Clic en tarjeta → vista previa (preview)
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

// ======================= 9) VISTA PREVIEW DE VIDEO =======================
function previewVideo(videoId, title) {
  const doIt = () => {
    player.mute();
    player.loadVideoById({ videoId, suggestedQuality: 'default' });
    player.playVideo();
    setTimeout(() => {
      player.unMute();
      player.setVolume(100);
    }, 200);

    statusDiv.textContent = `🔎 Vista previa: ${title}`;
    stopBtn.disabled = false;
    // Programar cuña
    scheduleNextCuna();
    // NO se agrega a la cola ni al historial en preview
  };

  if (!isPlayerReady) {
    pendingActions.push(doIt);
  } else {
    doIt();
  }
}

// ======================= 10) GESTIÓN DE LA COLA =======================
function addToQueue(videoId, title) {
  if (queue.some(item => item.videoId === videoId)) {
    alert('Este video ya está en la cola.');
    return;
  }
  queue.push({ videoId, title });
  renderQueue();
  statusDiv.textContent = `📝 Video agregado a la cola: "${title}".`;

  // Marcar con borde verde en la tarjeta de resultados
  const card = resultsDiv.querySelector(`.result-item[data-videoid="${videoId}"]`);
  if (card) {
    card.classList.add('in-queue');
    const btnAdd = card.querySelector('.result-add-btn');
    btnAdd.disabled = true;
    btnAdd.style.opacity = '0.5';
  }

  if (queue.length === 1) {
    playQueueBtn.disabled = false;
    hideCenteredSearch();
    showHeader();
  }
}

function renderQueue() {
  queueCountSpan.textContent = queue.length;

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

    // Clic en el item para reproducir desde la cola
    div.addEventListener('click', () => {
      playFromQueue(index);
    });

    // Botón “Eliminar”
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

  // Quitar borde verde de la tarjeta de resultados
  const card = resultsDiv.querySelector(`.result-item[data-videoid="${removed.videoId}"]`);
  if (card) {
    card.classList.remove('in-queue');
    const btnAdd = card.querySelector('.result-add-btn');
    btnAdd.disabled = false;
    btnAdd.style.opacity = '1';
  }

  if (removed.videoId === lastVideoId) {
    if (player && isPlayerReady) player.stopVideo();
    isPlaying = false;
    stopBtn.disabled = true;
    playQueueBtn.disabled = false;
    statusDiv.textContent = '🚫 Video en reproducción eliminado. Detenido.';
    lastVideoId = null;
  }
}

function playFromQueue(idx) {
  const { videoId, title } = queue[idx];
  const doIt = () => {
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
    showPlayerWrapper();
    hideResults();

    // Programar la siguiente cuña
    scheduleNextCuna();
  };

  if (!isPlayerReady) {
    pendingActions.push(doIt);
  } else {
    doIt();
  }
}

// loadNextInQueue espera a que el player esté listo antes de ejecutar
function loadNextInQueue() {
  const doIt = () => {
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
  };

  if (!isPlayerReady) {
    pendingActions.push(doIt);
  } else {
    doIt();
  }
}

function reorderQueue(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const item = queue.splice(fromIdx, 1)[0];
  queue.splice(toIdx, 0, item);
  renderQueue();
}

// ======================= 11) HISTORIAL =======================
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
  const doIt = () => {
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
    showPlayerWrapper();
    hideResults();

    // Programar la siguiente cuña
    scheduleNextCuna();
  };

  if (!isPlayerReady) {
    pendingActions.push(doIt);
  } else {
    doIt();
  }
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

// ======================= 12) CUÑAS PUBLICITARIAS =======================
function getRandomInterval() {
  return Math.floor(
    Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)
  ) + MIN_INTERVAL;
}

let countdownInterval = null;
function scheduleNextCuna() {
  stopCountdown();
  clearTimeout(randomTimerId);

  // Si no hay cuñas cargadas, no programamos nada
  if (cunas.length === 0) {
    return;
  }
  if (!isPlaying) return;

  const intervalo = getRandomInterval();
  startCountdown(intervalo);

  randomTimerId = setTimeout(() => {
    playCuna();
  }, intervalo);
}

function playCuna() {
  if (!isPlaying) return;
  if (cunas.length === 0) {
    return;
  }

  statusDiv.textContent = '🔊 Reproduciendo cuña publicitaria…';

  // Fade del video a 0% antes de iniciar la cuña
  fadeVolume(player, 100, 0, 1000, () => {
    const index = Math.floor(Math.random() * cunas.length);
    const cunaUrl = cunas[index];
// 1) Crear AudioContext y MediaElementSource a partir de la cuña
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
cunaAudio = new Audio(cunaUrl);
const source = audioCtx.createMediaElementSource(cunaAudio);

// 2) Crear un GainNode y fijar ganancia mayor a 1 (ej. 2 → 200%)
const gainNode = audioCtx.createGain();
gainNode.gain.value = 2.5;  // duplica el volumen de la cuña

// 3) Conectar: source → gainNode → destino del AudioContext
source.connect(gainNode);
gainNode.connect(audioCtx.destination);

// 4) Reproducir la cuña
cunaAudio.play();

    stopCountdown();

    cunaAudio.addEventListener('ended', () => {
      if (!isPlaying) return;
      // Al terminar la cuña, restauramos el volumen del video a 100%
      fadeVolume(player, 0, 100, 1000, () => {
        scheduleNextCuna();
      });
    });
    cunaAudio.addEventListener('error', () => {
      if (!isPlaying) return;
      fadeVolume(player, 0, 100, 1000, () => {
        scheduleNextCuna();
      });
    });
  });
}

// ======================= 13) AUTOPLAY “RELATED” =======================
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
        const newTitle   = data.items[0].snippet.title || 'Video Relacionado';

        const doIt = () => {
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
        };

        if (!isPlayerReady) {
          pendingActions.push(doIt);
        } else {
          doIt();
        }
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

// ======================= 14) TEMPORIZADOR FLOTANTE =======================
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

// ======================= 15) FADE DE VOLUMEN =======================
/**
 * fadeVolume(player, from, to, duration, callback)
 *   - player: instancia de YT.Player
 *   - from: volumen inicial (0-100)
 *   - to: volumen final (0-100)
 *   - duration: tiempo total del fade en ms
 *   - callback: función a llamar cuando termine el fade
 */
function fadeVolume(player, from, to, duration, callback) {
  if (!player || !isPlayerReady) {
    if (typeof callback === 'function') callback();
    return;
  }
  const stepTime = 100; // cada 100 ms
  const steps = Math.ceil(duration / stepTime);
  const volStep = (to - from) / steps;
  let currentVol = from;
  player.setVolume(Math.round(currentVol));

  let count = 0;
  const interval = setInterval(() => {
    count++;
    currentVol += volStep;
    if (count >= steps) {
      clearInterval(interval);
      player.setVolume(to);
      if (typeof callback === 'function') callback();
    } else {
      player.setVolume(Math.round(currentVol));
    }
  }, stepTime);
}
