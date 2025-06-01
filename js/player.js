// js/player.js

///////////////////////////////////////
// 1) Tu clave de YouTube Data API v3
///////////////////////////////////////
const YOUTUBE_API_KEY = 'AIzaSyCT6oq7Y-KcHEGLM4TusqoppYiGzxYgX9s';

///////////////////////////////////////
// 2) Variables globales
///////////////////////////////////////
let player;                  // Instancia del reproductor de YouTube
let isPlaying = false;       // ¿Está reproduciendo la cola o autoplay?
let queue = [];              // Cola de reproducción: array de { videoId, title }
let randomTimerId = null;    // ID de setTimeout para la siguiente cuña
let cunaAudio = null;        // <audio> de la cuña que esté sonando
let lastVideoId = null;      // ID del último video que se reprodujo (para related)

const cunas = [
  'assets/cunas/cuna1.mp3',
  'assets/cunas/cuna2.mp3',
  'assets/cunas/cuna3.mp3'
];

// Intervalos (ms) aleatorios entre 30 s y 5 min
const MIN_INTERVAL = 30 * 1000;       //  30 000 ms
const MAX_INTERVAL = 5 * 60 * 1000;   // 300 000 ms

///////////////////////////////////////
// 3) Esta función la invoca la IFrame API de YouTube
///////////////////////////////////////
function onYouTubeIframeAPIReady() {
  player = new YT.Player('youtube-player', {
    height: '315',
    width: '560',
    videoId: '', 
    playerVars: {
      autoplay: 0,       // No reproducir al cargar la página
      controls: 1,
      modestbranding: 1,
      rel: 1,            // Permite relatedToVideoId funcionar
      origin: window.location.origin,
      iv_load_policy: 3  // Desactiva anotaciones y tarjetas
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
  const startBtn  = document.getElementById('start-btn');
  const stopBtn   = document.getElementById('stop-btn');
  const searchBtn = document.getElementById('search-btn');
  const statusDiv = document.getElementById('status');

  // A) Botón “Buscar”
  searchBtn.addEventListener('click', () => {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
      alert('Escribe algo en el cuadro de búsqueda.');
      return;
    }
    statusDiv.textContent = `🔍 Buscando "${query}"…`;
    searchOnYouTube(query);
  });

  // B) Botón “Iniciar música”
  startBtn.addEventListener('click', () => {
    if (!isPlaying) {
      if (queue.length === 0) {
        alert('La cola está vacía. Busca y agrega al menos un video.');
        return;
      }
      isPlaying = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statusDiv.textContent = '▶️ Reproduciendo cola…';
      loadNextInQueue();   // Carga el primer video
      scheduleNextCuna();  // Arranca las cuñas intercaladas
    }
  });

  // C) Botón “Detener todo”
  stopBtn.addEventListener('click', () => {
    if (isPlaying) {
      isPlaying = false;
      clearTimeout(randomTimerId);
      if (cunaAudio) cunaAudio.pause();
      player.stopVideo();
      document.getElementById('start-btn').disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = 'Estado: detenido';
    }
  });
}

///////////////////////////////////////
// 5) Cuando cambia el estado del reproductor
///////////////////////////////////////
function onPlayerStateChange(event) {
  // Si el video actual finalizó:
  if (event.data === YT.PlayerState.ENDED) {
    // 1) Si aún hay videos en la cola, reproducir el siguiente
    if (isPlaying && queue.length > 0) {
      loadNextInQueue();
      return;
    }
    // 2) Si la cola está vacía pero seguimos en modo “play”, buscamos relacionado
    if (isPlaying && queue.length === 0 && lastVideoId) {
      fetchAndPlayRelated(lastVideoId);
      return;
    }
    // 3) Si no hay más cola y no podemos buscar relacionado, detenemos
    if (isPlaying && queue.length === 0 && !lastVideoId) {
      isPlaying = false;
      document.getElementById('start-btn').disabled = false;
      document.getElementById('stop-btn').disabled = true;
      document.getElementById('status').textContent =
        '✅ No hay más videos en cola. Agrega uno o busca de nuevo.';
    }
  }
}

///////////////////////////////////////
// 6) Buscar videos en YouTube (YouTube Data API v3)
///////////////////////////////////////
function searchOnYouTube(query) {
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = ''; // Limpiar resultados previos

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
      if (!data.items || data.items.length === 0) {
        statusDiv.textContent = `❌ No se encontraron resultados para "${query}".`;
        return;
      }
      statusDiv.textContent = `✅ Resultados para "${query}":`;

      data.items.forEach((item) => {
        const videoId   = item.id.videoId;
        const title     = item.snippet.title;
        const thumbnail = item.snippet.thumbnails.medium.url;

        const container = document.createElement('div');
        container.className = 'result-item';
        container.dataset.videoId = videoId;
        container.innerHTML = `
          <img class="result-thumb" src="${thumbnail}" alt="Miniatura">
          <div class="result-title">${title}</div>
        `;
        container.addEventListener('click', () => {
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
  queue.push({ videoId, title });
  updateQueueStatus();
}

function updateQueueStatus() {
  const statusDiv = document.getElementById('status');
  if (isPlaying) {
    statusDiv.textContent = `▶️ Reproduciendo… Cola: ${queue.length} video(s) restante(s).`;
  } else {
    statusDiv.textContent = `📝 Cola actual: ${queue.length} video(s). Pulsa "Iniciar música".`;
  }
}

///////////////////////////////////////
// 8) Cargar el siguiente video de la cola
///////////////////////////////////////
function loadNextInQueue() {
  const statusDiv = document.getElementById('status');

  if (queue.length === 0) {
    // Si la cola ya está vacía, intentamos hacer autoplay de un related
    if (lastVideoId) {
      fetchAndPlayRelated(lastVideoId);
    } else {
      // No hay lastVideoId → no podemos buscar relacionado
      isPlaying = false;
      document.getElementById('start-btn').disabled = false;
      document.getElementById('stop-btn').disabled = true;
      statusDiv.textContent = '✅ La cola terminó. Agrega más videos o busca de nuevo.';
    }
    return;
  }

  // Tomamos el siguiente de la cola
  const next = queue.shift();
  const { videoId, title } = next;

  // Guardamos el ID para la próxima búsqueda de related
  lastVideoId = videoId;

  // Para sortear la política de autoplay de navegadores, primero muteamos
  player.mute();

  // Cargar el video
  player.loadVideoById({
    videoId: videoId,
    suggestedQuality: 'default'
  });

  // Llamamos a playVideo() inmediatamente
  player.playVideo();

  // Mostramos estado
  statusDiv.textContent = `▶️ Reproduciendo: ${title} (Quedan ${queue.length})`;

  // Tras un breve lapso, desmuteamos y fijamos volumen al 100%
  setTimeout(() => {
    player.unMute();
    player.setVolume(100);
  }, 200);

  // Programar la siguiente cuña
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
  cunaAudio.volume = 1.0; // 100% de la cuña
  cunaAudio.play();

  // Cuando la cuña termine, restaurar volumen y agendar la siguiente cuña
  cunaAudio.addEventListener('ended', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    updateQueueStatus();
    scheduleNextCuna();
  });

  // En caso de error, restaurar volumen y continuar
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

  // Si no tenemos videoId válido, abortamos
  if (!videoId) {
    isPlaying = false;
    document.getElementById('start-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
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
      if (
        data.items &&
        data.items.length > 0 &&
        data.items[0].id.videoId
      ) {
        const newVideoId = data.items[0].id.videoId;
        const newTitle   = data.items[0].snippet.title || 'Video Relacionado';

        // Guardamos el nuevo videoId para la próxima búsqueda related
        lastVideoId = newVideoId;

        // Mute temporal para sortear restricción de autoplay
        player.mute();

        // Cargar el video relacionado
        player.loadVideoById({
          videoId: newVideoId,
          suggestedQuality: 'default'
        });

        // Reproducirlo inmediatamente
        player.playVideo();

        statusDiv.textContent = `▶️ Reproduciendo relacionado: ${newTitle}`;

        // Desmutear tras un breve lapso
        setTimeout(() => {
          player.unMute();
          player.setVolume(100);
        }, 200);

        // Programar la siguiente cuña
        scheduleNextCuna();
      } else {
        statusDiv.textContent =
          '❌ No se encontró ningún video relacionado. Fin de reproducción.';
        isPlaying = false;
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
      }
    })
    .catch((err) => {
      console.error(err);
      statusDiv.textContent = `⚠️ Error buscando relacionado: ${err.message}`;
      isPlaying = false;
      document.getElementById('start-btn').disabled = false;
      document.getElementById('stop-btn').disabled = true;
    });
}
