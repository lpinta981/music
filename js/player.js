// js/player.js

///////////////////////////////////////
// 1) Tu clave de YouTube Data API v3
///////////////////////////////////////
const YOUTUBE_API_KEY = 'AIzaSyCT6oq7Y-KcHEGLM4TusqoppYiGzxYgX9s';

///////////////////////////////////////
// 2) Variables globales
///////////////////////////////////////
let player;                  // Instancia del reproductor de YouTube
let isPlaying = false;       // ¿Está reproduciendo la cola (o autoplay)?
let queue = [];              // Cola de reproducción: array de { videoId, title }
let randomTimerId = null;    // ID de setTimeout para la siguiente cuña
let cunaAudio = null;        // <audio> de la cuña que esté sonando
let lastVideoId = null;      // <-- Guardo aquí el último video que se reprodujo

// Lista de cuñas (asegúrate de subir estos mp3 en assets/cunas/)
const cunas = [
  'assets/cunas/cuna1.mp3',
  'assets/cunas/cuna2.mp3',
  'assets/cunas/cuna3.mp3'
];

// Intervalos (ms) aleatorios entre 30 s y 5 min
const MIN_INTERVAL = 30 * 1000;       //  30 segundos
const MAX_INTERVAL = 5 * 60 * 1000;   // 300 segundos = 5 minutos

///////////////////////////////////////
// 3) YouTube IFrame API invoca esta función
///////////////////////////////////////
function onYouTubeIframeAPIReady() {
  player = new YT.Player('youtube-player', {
    height: '315',
    width: '560',
    videoId: '',  // Al principio vacío; luego cargamos con cola o autoplay
    playerVars: {
      autoplay: 0,
      controls: 1,      // 1 para que se vean controles
      modestbranding: 1,
      rel: 1,           // IMPORTANTE: permite que relatedToVideoId funcione
      showinfo: 0
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
      loadNextInQueue();  // Carga el primer video
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
    // 1) Guardar el video que terminó (si aún no estaba en lastVideoId)
    if (!lastVideoId) {
      lastVideoId = player.getVideoData().video_id;
    }
    // 2) Si la cola NO está vacía, reproducir siguiente:
    if (isPlaying && queue.length > 0) {
      loadNextInQueue();
    }
    // 3) Si la cola está vacía pero seguimos en “play mode”, buscamos relacionado:
    else if (isPlaying && queue.length === 0) {
      fetchAndPlayRelated(lastVideoId);
    }
    // 4) Si no hay reproducción activa, no hacemos nada.
  }
}

///////////////////////////////////////
// 6) Buscar videos en YouTube (Data API v3)
///////////////////////////////////////
function searchOnYouTube(query) {
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = ''; // Limpiar resultados previos

  // Construir URL de búsqueda
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
      if (!response.ok) throw new Error('Error en YouTube Data API');
      return response.json();
    })
    .then((data) => {
      if (!data.items || data.items.length === 0) {
        statusDiv.textContent = `❌ No se encontraron resultados para "${query}".`;
        return;
      }
      statusDiv.textContent = `✅ Resultados para "${query}":`;

      data.items.forEach((item) => {
        const videoId = item.id.videoId;
        const title = item.snippet.title;
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
    // Si ya no hay videos en la cola, hacer autoplay de relacionado:
    fetchAndPlayRelated(lastVideoId);
    return;
  }

  // Sacamos el primer video
  const next = queue.shift();
  const { videoId, title } = next;

  // Actualizamos lastVideoId para la próxima búsqueda de relacionado
  lastVideoId = videoId;

  // Cargamos y reproducimos
  player.loadVideoById(videoId);
  statusDiv.textContent = `▶️ Reproduciendo: ${title} (Quedan ${queue.length})`;
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

  // Cuando la cuña termina, restaurar volumen y agendar siguiente
  cunaAudio.addEventListener('ended', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    updateQueueStatus();
    scheduleNextCuna();
  });

  // En caso de error con la cuña, restaurar y continuar
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
        throw new Error('Error en YouTube Data API (related)');
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
        const newTitle = data.items[0].snippet.title || 'Video Relacionado';

        // Actualizar lastVideoId y cargar el nuevo video
        lastVideoId = newVideoId;
        player.loadVideoById(newVideoId);

        statusDiv.textContent = `▶️ Reproduciendo relacionado: ${newTitle}`;
        // (La cola sigue vacía, pero el player tiene autoplay)
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
