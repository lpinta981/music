// js/player.js

///////////////////////////////////////
// 1) Tu clave de YouTube Data API v3
///////////////////////////////////////
const YOUTUBE_API_KEY = 'AIzaSyCT6oq7Y-KcHEGLM4TusqoppYiGzxYgX9s';

///////////////////////////////////////
// 2) Variables globales
///////////////////////////////////////
let player;                  // Instancia de YT.Player
let isPlaying = false;       // ¿Está reproduciendo la cola (o related autoplay)?
let queue = [];              // Cola: array de objetos { videoId, title }
let randomTimerId = null;    // ID de setTimeout para cuñas
let cunaAudio = null;        // <audio> de la cuña en reproducción
let lastVideoId = null;      // ID del último video reproducido (para related)

let historyList = [];        // Lista de últimos 30 reproducidos: array de { videoId, title, timestamp }

// Rutas de cuñas (asegúrate de subir estos mp3 en assets/cunas/)
const cunas = [
  'assets/cunas/cuna1.mp3',
  'assets/cunas/cuna2.mp3',
  'assets/cunas/cuna3.mp3'
];

// Intervalos (ms) aleatorios entre 30 s y 5 min
const MIN_INTERVAL = 30 * 1000;       //  30 000 ms
const MAX_INTERVAL = 5 * 60 * 1000;   // 300 000 ms

// Elementos del DOM que usaremos frecuentemente
let statusDiv, stopBtn, playQueueBtn,
    resultsDiv, queueContainer, historyContainer;

///////////////////////////////////////
// 3) YouTube IFrame API invoca esta función
///////////////////////////////////////
function onYouTubeIframeAPIReady() {
  player = new YT.Player('youtube-player', {
    height: '360',
    width: '640',
    videoId: '',
    playerVars: {
      autoplay: 0,       // Al cargar la página no suene nada
      controls: 1,
      modestbranding: 1,
      rel: 1,            // Para relatedToVideoId
      origin: window.location.origin,
      iv_load_policy: 3  // Sin anotaciones ni tarjetas
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
}

///////////////////////////////////////
// 4) Cuando el reproductor está listo
///////////////////////////////////////
function onPlayerReady(event) {
  // Referencias a elementos clave
  statusDiv         = document.getElementById('status');
  stopBtn           = document.getElementById('stop-btn');
  playQueueBtn      = document.getElementById('play-queue-btn');
  resultsDiv        = document.getElementById('results');
  queueContainer    = document.getElementById('queue-container');
  historyContainer  = document.getElementById('history-container');

  // Botón “Buscar”
  document.getElementById('search-btn').addEventListener('click', () => {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
      alert('Escribe algo para buscar en YouTube.');
      return;
    }
    statusDiv.textContent = `🔍 Buscando "${query}"…`;
    searchOnYouTube(query);
  });

  // Botón “Limpiar Resultados”
  document.getElementById('clear-results-btn').addEventListener('click', () => {
    resultsDiv.innerHTML = '';
    statusDiv.textContent = '🗑 Resultados limpiados.';
  });

  // Botón “Reproducir Cola”
  playQueueBtn.addEventListener('click', () => {
    if (!isPlaying && queue.length > 0) {
      isPlaying = true;
      playQueueBtn.disabled = true;
      document.getElementById('start-btn').disabled = true; // ya no hace falta
      statusDiv.textContent = '▶️ Reproduciendo cola…';
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
      document.getElementById('start-btn').disabled = false;
      stopBtn.disabled = true;
      playQueueBtn.disabled = false;
      statusDiv.textContent = 'Estado: detenido';
      // Quitamos la clase .active de cualquier item en cola
      document.querySelectorAll('.queue-item.active').forEach(el => el.classList.remove('active'));
    }
  });

  // Inicialmente, deshabilitar botones de reproducción y detención
  document.getElementById('start-btn').disabled = true;
  stopBtn.disabled = true;
  playQueueBtn.disabled = true;
}

///////////////////////////////////////
// 5) Cuando cambia el estado del reproductor
///////////////////////////////////////
function onPlayerStateChange(event) {
  // Si el video terminó:
  if (event.data === YT.PlayerState.ENDED) {
    // 1) Si hay más en la cola, reproducir siguiente
    if (isPlaying && queue.length > 0) {
      loadNextInQueue();
      return;
    }
    // 2) Si la cola está vacía pero seguimos en modo “play”, buscar related
    if (isPlaying && queue.length === 0 && lastVideoId) {
      fetchAndPlayRelated(lastVideoId);
      return;
    }
    // 3) Si no hay más cola y no podemos buscar related, detenemos
    if (isPlaying && queue.length === 0 && !lastVideoId) {
      isPlaying = false;
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = '✅ La cola terminó. Agrega nuevos videos.';
    }
  }
}

///////////////////////////////////////
// 6) Buscar videos en YouTube (Data API v3)
///////////////////////////////////////
function searchOnYouTube(query) {
  const encodedQuery = encodeURIComponent(query);
  const url =
    'https://www.googleapis.com/youtube/v3/search' +
    '?part=snippet' +
    '&type=video' +
    '&maxResults=10' +
    `&key=${YOUTUBE_API_KEY}` +
    `&q=${encodedQuery}`;

  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`YouTube Data API: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      // Limpiar resultados previos
      resultsDiv.innerHTML = '';

      if (!data.items || data.items.length === 0) {
        statusDiv.textContent = `❌ No se encontraron resultados para "${query}".`;
        return;
      }
      statusDiv.textContent = `✅ Resultados para "${query}":`;

      data.items.forEach((item) => {
        const videoId   = item.id.videoId;
        const title     = item.snippet.title;
        const thumbnail = item.snippet.thumbnails.medium.url;

        // Crear contenedor del resultado
        const container = document.createElement('div');
        container.className = 'result-item';

        // HTML interno
        container.innerHTML = `
          <img class="result-thumb" src="${thumbnail}" alt="Miniatura">
          <div class="result-title">${title}</div>
          <button class="btn-add" title="Añadir a cola">+</button>
        `;
        // Capturamos el botón “+”
        const btnAdd = container.querySelector('.btn-add');
        btnAdd.addEventListener('click', (e) => {
          e.stopPropagation();
          addToQueue(videoId, title);
        });

        resultsDiv.appendChild(container);
      });
    })
    .catch((err) => {
      console.error(err);
      statusDiv.textContent = `⚠️ Error al buscar: ${err.message}`;
    });
}

///////////////////////////////////////
// 7) Agregar un video a la cola
///////////////////////////////////////
function addToQueue(videoId, title) {
  // Verificamos que no esté duplicado
  if (queue.some(item => item.videoId === videoId)) {
    alert('Este video ya está en la cola.');
    return;
  }
  queue.push({ videoId, title });
  renderQueue();
  statusDiv.textContent = `📝 Video agregado a la cola: "${title}".`;
  // Habilitar botones de reproducción si era la primera vez
  if (queue.length === 1) {
    document.getElementById('start-btn').disabled = false;
    playQueueBtn.disabled = false;
  }
}

// Renderiza la cola completa en #queue-container
function renderQueue() {
  queueContainer.innerHTML = '';
  queue.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.dataset.index = index;

    // Si este es el video que se está reproduciendo, le ponemos la clase .active
    if (item.videoId === lastVideoId && isPlaying) {
      div.classList.add('active');
    }

    div.innerHTML = `
      <div class="queue-title">${item.title}</div>
      <div class="queue-actions">
        <button class="btn-remove" title="Eliminar">🗑</button>
      </div>
    `;
    // Click sobre todo el .queue-item → reproducir ese video ahora
    div.addEventListener('click', () => {
      playFromQueue(index);
    });
    // Botón “Eliminar”
    const btnRemove = div.querySelector('.btn-remove');
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromQueue(index);
    });

    queueContainer.appendChild(div);
  });
}

// Elimina el elemento en posición `idx` de la cola
function removeFromQueue(idx) {
  const wasPlaying = isPlaying;
  const removed = queue.splice(idx, 1)[0];

  // Si el video eliminado era el que se estaba reproduciendo, detenemos
  if (wasPlaying && removed.videoId === lastVideoId) {
    player.stopVideo();
    isPlaying = false;
    stopBtn.disabled = true;
    playQueueBtn.disabled = false;
    statusDiv.textContent = '▶️ Eliminaste el video en reproducción. Detenido.';
    lastVideoId = null;
  }
  renderQueue();
  if (queue.length === 0) {
    document.getElementById('start-btn').disabled = true;
    playQueueBtn.disabled = true;
  }
}

// Reproducir directamente un video desde la cola (índice idx)
function playFromQueue(idx) {
  const { videoId, title } = queue[idx];
  // Remover todos los demás estados “active”
  document.querySelectorAll('.queue-item.active').forEach(el => el.classList.remove('active'));

  // Reproducir ese video
  isPlaying = true;
  lastVideoId = videoId;
  player.mute();
  player.loadVideoById({ videoId, suggestedQuality: 'default' });
  player.playVideo();

  // Desmutear un poco después
  setTimeout(() => {
    player.unMute();
    player.setVolume(100);
  }, 200);

  statusDiv.textContent = `▶️ Reproduciendo de la cola: ${title}`;
  stopBtn.disabled = false;
  document.getElementById('start-btn').disabled = true;
  playQueueBtn.disabled = true;

  // Marcar como activo en la cola
  const div = queueContainer.querySelector(`.queue-item[data-index="${idx}"]`);
  if (div) div.classList.add('active');

  // Agregar al historial
  addToHistory(videoId, title);
}

///////////////////////////////////////
// 8) Cargar el siguiente video de la cola
///////////////////////////////////////
function loadNextInQueue() {
  const statusDiv = document.getElementById('status');

  if (queue.length === 0) {
    // Si la cola ya está vacía, intentamos autoplay de related
    if (lastVideoId) {
      fetchAndPlayRelated(lastVideoId);
    } else {
      // No hay lastVideoId → nada más para reproducir
      isPlaying = false;
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = '✅ Cola vacía. Agrega nuevos videos.';
    }
    renderQueue();
    return;
  }

  // Tomamos el primer video
  const next = queue.shift();
  const { videoId, title } = next;

  // Guardamos el ID para búsqueda de related
  lastVideoId = videoId;

  // Mutear para sortear bloqueo de autoplay
  player.mute();
  player.loadVideoById({ videoId, suggestedQuality: 'default' });
  player.playVideo();

  statusDiv.textContent = `▶️ Reproduciendo: ${title} (Quedan ${queue.length})`;

  // Después de 200ms, desmutear y poner al 100%
  setTimeout(() => {
    player.unMute();
    player.setVolume(100);
  }, 200);

  // Marcar la primera entrada de la cola como activa
  renderQueue();

  // Deshabilitar botón de “Reproducir Cola” mientras suena
  playQueueBtn.disabled = true;
  stopBtn.disabled = false;

  // Agregar al historial
  addToHistory(videoId, title);

  // Programar siguiente cuña
  scheduleNextCuna();
}

///////////////////////////////////////
// 9) Programar cuñas en intervalos aleatorios
///////////////////////////////////////
function getRandomInterval() {
  return Math.floor(
    Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)
  ) + MIN_INTERVAL;
}

function scheduleNextCuna() {
  if (!isPlaying) return;
  const intervalo = getRandomInterval();
  randomTimerId = setTimeout(() => {
    playCuna();
  }, intervalo);
}

function playCuna() {
  if (!isPlaying) return;
  const statusDiv = document.getElementById('status');

  // Bajar volumen del video a 20
  player.setVolume(20);
  statusDiv.textContent = '🔊 Reproduciendo cuña publicitaria…';

  // Elegir cuña al azar
  const cunaUrl = cunas[Math.floor(Math.random() * cunas.length)];
  cunaAudio = new Audio(cunaUrl);
  cunaAudio.volume = 1.0;
  cunaAudio.play();

  // Al terminar la cuña:
  cunaAudio.addEventListener('ended', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    updateQueueStatus(); 
    scheduleNextCuna();
  });

  // En caso de error:
  cunaAudio.addEventListener('error', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    updateQueueStatus();
    scheduleNextCuna();
  });
}

///////////////////////////////////////
// 10) Buscar y reproducir un video relacionado
///////////////////////////////////////
function fetchAndPlayRelated(videoId) {
  const statusDiv = document.getElementById('status');

  if (!videoId) {
    isPlaying = false;
    playQueueBtn.disabled = false;
    stopBtn.disabled = true;
    statusDiv.textContent = '❌ No hay video previo para buscar relacionado.';
    return;
  }

  const url =
    'https://www.googleapis.com/youtube/v3/search' +
    '?part=snippet' +
    '&type=video' +
    '&maxResults=1' +
    `&relatedToVideoId=${encodeURIComponent(videoId)}` +
    `&key=${YOUTUBE_API_KEY}`;

  statusDiv.textContent = '🔍 Buscando video relacionado…';

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`YouTube Data API (related): ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      if (data.items && data.items.length > 0 && data.items[0].id.videoId) {
        const newVideoId = data.items[0].id.videoId;
        const newTitle   = data.items[0].snippet.title || 'Video Relacionado';

        lastVideoId = newVideoId;

        player.mute();
        player.loadVideoById({ videoId: newVideoId, suggestedQuality: 'default' });
        player.playVideo();

        statusDiv.textContent = `▶️ Reproduciendo relacionado: ${newTitle}`;

        setTimeout(() => {
          player.unMute();
          player.setVolume(100);
        }, 200);

        addToHistory(newVideoId, newTitle);
        scheduleNextCuna();
      } else {
        statusDiv.textContent =
          '❌ No se encontró ningún video relacionado. Fin de reproducción.';
        isPlaying = false;
        playQueueBtn.disabled = false;
        stopBtn.disabled = true;
      }
    })
    .catch((err) => {
      console.error(err);
      statusDiv.textContent = `⚠️ Error buscando relacionado: ${err.message}`;
      isPlaying = false;
      playQueueBtn.disabled = false;
      stopBtn.disabled = true;
    });
}

///////////////////////////////////////
// 11) Historial de últimos 30 videos
///////////////////////////////////////
function addToHistory(videoId, title) {
  const timestamp = new Date().toLocaleTimeString();
  // Si ya existe en el historial, lo quitamos primero (para no duplicar)
  historyList = historyList.filter(item => item.videoId !== videoId);
  // Añadimos al frente
  historyList.unshift({ videoId, title, timestamp });
  // Si excede 30, borramos el último
  if (historyList.length > 30) {
    historyList.pop();
  }
  renderHistory();
}

// Renderiza el historial en #history-container
function renderHistory() {
  historyContainer.innerHTML = '';
  historyList.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.dataset.index = idx;
    div.innerHTML = `
      <div class="history-title">${item.title}</div>
      <div class="history-actions">${item.timestamp}</div>
    `;
    // Al hacer clic, reproducimos ese video
    div.addEventListener('click', () => {
      playFromHistory(idx);
    });
    historyContainer.appendChild(div);
  });
}

// Reproducir un video directamente desde el historial
function playFromHistory(idx) {
  const { videoId, title } = historyList[idx];
  // Mutear para autoplay
  player.mute();
  player.loadVideoById({ videoId, suggestedQuality: 'default' });
  player.playVideo();
  setTimeout(() => {
    player.unMute();
    player.setVolume(100);
  }, 200);

  statusDiv.textContent = `▶️ Reproduciendo del historial: ${title}`;
  stopBtn.disabled = false;
  playQueueBtn.disabled = true;
  isPlaying = true;
  lastVideoId = videoId;
  addToHistory(videoId, title);
  scheduleNextCuna();
}

///////////////////////////////////////
// 12) Actualizar estado de la cola
///////////////////////////////////////
function updateQueueStatus() {
  if (queue.length === 0) {
    statusDiv.textContent = '📝 Cola vacía. Agrega nuevos videos para reproducir.';
    return;
  }
  statusDiv.textContent = `📝 Cola: ${queue.length} video(s) restante(s). Pulsa “Reproducir Cola”.`;
}

// NOTA: No usamos un botón “start-btn” separado ya que ahora tenemos “play-queue-btn”.
