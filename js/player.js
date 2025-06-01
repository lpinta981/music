// js/player.js

///////////////////////////////////////
// 1) Tu clave de YouTube Data API v3
///////////////////////////////////////
// Reemplaza con la API Key que me diste:
const YOUTUBE_API_KEY = 'AIzaSyCT6oq7Y-KcHEGLM4TusqoppYiGzxYgX9s';

///////////////////////////////////////
// 2) Variables globales
///////////////////////////////////////
let player;                // Instancia del YouTube Player
let isPlaying = false;     // ¿Está reproduciendo la cola?
let queue = [];            // Cola de reproducción: array de objetos { videoId, title }
let randomTimerId = null;  // ID de setTimeout para cuñas
let cunaAudio = null;      // <audio> para la cuña

// Lista de cuñas (asegúrate de subir estos .mp3 a assets/cunas/)
const cunas = [
  'assets/cunas/cuna1.mp3',
  'assets/cunas/cuna2.mp3',
  'assets/cunas/cuna3.mp3'
];

// Intervalos (ms) – aleatorio entre 30 s y 5 min
const MIN_INTERVAL = 30 * 1000;       // 30 segundos
const MAX_INTERVAL = 5 * 60 * 1000;   // 300 segundos = 5 minutos

///////////////////////////////////////
// 3) Esta función la llama YouTube IFrame API al cargar
///////////////////////////////////////
function onYouTubeIframeAPIReady() {
  player = new YT.Player('youtube-player', {
    height: '315',
    width: '560',
    videoId: '',  // Vacío al inicio; luego usaremos la cola
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0,
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

  // Buscar en YouTube al hacer clic
  searchBtn.addEventListener('click', () => {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
      alert('Escribe algo en el cuadro de búsqueda.');
      return;
    }
    statusDiv.textContent = `🔍 Buscando "${query}"…`;
    searchOnYouTube(query);
  });

  // Iniciar reproducción de la cola
  startBtn.addEventListener('click', () => {
    if (!isPlaying) {
      if (queue.length === 0) {
        alert('La cola está vacía. Busca y agrega al menos un video.');
        return;
      }
      isPlaying = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statusDiv.textContent = '▶️ Reproduciendo la cola…';
      loadNextInQueue();  // Carga el primer video
      scheduleNextCuna();  // Arranca las cuñas
    }
  });

  // Detener todo (video + cuñas)
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
  // Si el video actual finalizó, carga el siguiente en la cola
  if (event.data === YT.PlayerState.ENDED && isPlaying) {
    loadNextInQueue();
  }
}

///////////////////////////////////////
// 6) Buscar videos en YouTube (Data API v3)
///////////////////////////////////////
function searchOnYouTube(query) {
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = ''; // Limpiar resultados previos

  // Construir URL de la API de búsqueda
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet` +
              `&type=video&maxResults=10&key=${YOUTUBE_API_KEY}` +
              `&q=${encodedQuery}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error('Error en petición YouTube Data API');
      return response.json();
    })
    .then(data => {
      if (!data.items || data.items.length === 0) {
        statusDiv.textContent = `❌ No se encontraron resultados para "${query}".`;
        return;
      }
      statusDiv.textContent = `✅ Mostrando resultados para "${query}":`;

      data.items.forEach(item => {
        const videoId   = item.id.videoId;
        const title     = item.snippet.title;
        const thumbnail = item.snippet.thumbnails.medium.url;

        // Crear tarjeta de resultado
        const container = document.createElement('div');
        container.className = 'result-item';
        container.dataset.videoId = videoId; // Guardar ID

        container.innerHTML = `
          <img class="result-thumb" src="${thumbnail}" alt="Miniatura">
          <div class="result-title">${title}</div>
        `;
        // Al hacer clic, lo agregamos a la cola
        container.addEventListener('click', () => {
          addToQueue(videoId, title);
        });

        resultsDiv.appendChild(container);
      });
    })
    .catch(err => {
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

// Actualizar texto en pantalla con cuántos quedan en cola
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
    // Si no hay más videos, detenemos todo
    isPlaying = false;
    player.stopVideo();
    document.getElementById('start-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    statusDiv.textContent = '✅ La cola terminó. Agrega más videos o busca de nuevo.';
    return;
  }

  // Sacar el primer video y reproducirlo
  const next = queue.shift();
  const { videoId, title } = next;

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

  // 1) Reducir volumen del video a 20
  player.setVolume(20);
  statusDiv.textContent = '🔊 Reproduciendo cuña publicitaria…';

  // 2) Elegir cuña al azar
  const cunaUrl = cunas[Math.floor(Math.random() * cunas.length)];
  cunaAudio = new Audio(cunaUrl);
  cunaAudio.volume = 1.0; // 100% para la cuña
  cunaAudio.play();

  // 3) Cuando la cuña termina, restaurar volumen y agendar siguiente
  cunaAudio.addEventListener('ended', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    updateQueueStatus(); // Mostrar cuántos videos quedan
    scheduleNextCuna();
  });

  // 4) En caso de error, restaurar de inmediato
  cunaAudio.addEventListener('error', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    updateQueueStatus();
    scheduleNextCuna();
  });
}
