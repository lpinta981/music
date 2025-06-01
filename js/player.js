// js/player.js

let player;                // Instancia del YouTube Player
let randomTimerId = null;  // ID de setTimeout para la cuña
let cunaAudio = null;      // Elemento <audio> para la cuña
let cunas = [
  'assets/cunas/cuna1.mp3',
  'assets/cunas/cuna2.mp3',
  'assets/cunas/cuna3.mp3'
  // Agrega más URLs relativas si tienes más cuñas
];

// Intervalos (ms)
const MIN_INTERVAL = 30 * 1000;    // 30 segundos
const MAX_INTERVAL = 5 * 60 * 1000; // 5 minutos

let isPlaying = false; // Estado general

// 1) Función que la API de YouTube llama cuando carga
function onYouTubeIframeAPIReady() {
  player = new YT.Player('youtube-player', {
    height: '315',
    width: '560',
    videoId: 'TU_VIDEO_O_PLAYLIST_ID', // <<— Aquí reemplaza con tu ID
    playerVars: {
      autoplay: 0,    // No reproducir sin clic
      controls: 0,    // Ocultar controles (0) o mostrarlos (1)
      modestbranding: 1,
      loop: 1,        // Si quieres repetir
      rel: 0
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
}

// 2) Cuando el reproductor está listo
function onPlayerReady(event) {
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const statusDiv = document.getElementById('status');

  startBtn.addEventListener('click', () => {
    if (!isPlaying) {
      isPlaying = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statusDiv.textContent = 'Reproduciendo música en YouTube...';
      player.setVolume(100);
      player.playVideo();
      scheduleNextCuna(); // Programamos la primera cuña
    }
  });

  stopBtn.addEventListener('click', () => {
    if (isPlaying) {
      isPlaying = false;
      clearTimeout(randomTimerId);
      if (cunaAudio) cunaAudio.pause();
      player.stopVideo();
      startBtn.disabled = false;
      stopBtn.disabled = true;
      statusDiv.textContent = 'Estado: detenido';
    }
  });
}

// 3) Si cambia el estado (no obligatorio manejarlo)
function onPlayerStateChange(event) {
  // Aquí puedes chequear event.data === YT.PlayerState.PLAYING, etc.
}

// 4) Genera intervalo aleatorio entre MIN y MAX (ms)
function getRandomInterval() {
  return Math.floor(
    Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)
  ) + MIN_INTERVAL;
}

// 5) Programa la próxima cuña
function scheduleNextCuna() {
  if (!isPlaying) return;
  const intervalo = getRandomInterval();
  randomTimerId = setTimeout(() => {
    playCuna();
  }, intervalo);
}

// 6) Reproduce la cuña
function playCuna() {
  if (!isPlaying) return;
  const statusDiv = document.getElementById('status');

  // Bajar volumen de YouTube a 20
  player.setVolume(20);
  statusDiv.textContent = '🔊 Reproduciendo cuña: bajando música';

  // Elegir cuña aleatoria
  const cunaUrl = cunas[Math.floor(Math.random() * cunas.length)];
  cunaAudio = new Audio(cunaUrl);
  cunaAudio.volume = 1.0;
  cunaAudio.play();

  // Cuando acaba la cuña, restaurar y programar siguiente
  cunaAudio.addEventListener('ended', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    statusDiv.textContent = '▶️ Reproduciendo música en YouTube...';
    scheduleNextCuna();
  });

  // Si hay error, igual restaurar y programar
  cunaAudio.addEventListener('error', () => {
    if (!isPlaying) return;
    player.setVolume(100);
    statusDiv.textContent = '⚠️ Error en cuña. Regresando a música...';
    scheduleNextCuna();
  });
}
