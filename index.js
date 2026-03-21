const SCENES_DATA = APP_DATA.scenes;
const MARKER_STYLE = APP_DATA.markerStyle;
const HOME_SCENE_ID = APP_DATA.homeSceneId;
const AUTOROTATE_SETTINGS = APP_DATA.autorotateSettings;

let viewer, currentScene, currentSceneData, hotspotsContainer, animationFrameId, currentSceneId;
let popupImageIndex = 0;
let autorotateEnabled = false;
let autorotateAnimationId = null;

// Icon SVGs
const ICONS = {
  arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
  arrowCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
  drone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="10" width="8" height="4" rx="1"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/><line x1="6" y1="7" x2="9" y2="10"/><line x1="18" y1="7" x2="15" y2="10"/><line x1="6" y1="17" x2="9" y2="14"/><line x1="18" y1="17" x2="15" y2="14"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
};

function getIcon(id) {
  return ICONS[id] || ICONS.arrowRight;
}

function init() {
  viewer = new Marzipano.Viewer(document.getElementById('viewer'));
  hotspotsContainer = document.createElement('div');
  hotspotsContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;';
  document.getElementById('viewer').appendChild(hotspotsContainer);
  
  renderThumbnails();
  if (SCENES_DATA.length > 0) {
    loadScene(HOME_SCENE_ID || SCENES_DATA[0].id);
  }
}

function renderThumbnails() {
  const container = document.getElementById('thumbnails');
  if (SCENES_DATA.length <= 1) {
    container.style.display = 'none';
    return;
  }
  SCENES_DATA.forEach(scene => {
    const thumb = document.createElement('div');
    thumb.className = 'thumbnail';
    thumb.dataset.sceneId = scene.id;
    thumb.innerHTML = '<img src="' + scene.imageUrl + '" alt="' + scene.name + '">' + 
      (scene.id === HOME_SCENE_ID ? '<div class="home-indicator"><svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>' : '');
    thumb.onclick = () => loadScene(scene.id);
    container.appendChild(thumb);
  });
}

function loadScene(sceneId) {
  const sceneData = SCENES_DATA.find(s => s.id === sceneId);
  if (!sceneData) return;
  
  document.getElementById('loading').classList.remove('hidden');
  closeInfoPopup();
  
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (currentScene) viewer.destroyScene(currentScene);
  
  currentSceneData = sceneData;
  currentSceneId = sceneId;
  
  // Detect max texture size for device (critical for mobile/Android)
  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  var maxTextureSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 2048;
  
  // Use conservative size for mobile devices to avoid black screen
  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  var maxSize = isMobile ? Math.min(maxTextureSize, 2048) : Math.min(maxTextureSize, 4096);
  
  var levels = [{ width: maxSize }];
  var source = Marzipano.ImageUrlSource.fromString(sceneData.imageUrl);
  var geometry = new Marzipano.EquirectGeometry(levels);
  var limiter = Marzipano.RectilinearView.limit.traditional(maxSize, 100*Math.PI/180, 120*Math.PI/180);
  var view = new Marzipano.RectilinearView(sceneData.initialView, limiter);
  
  currentScene = viewer.createScene({ source: source, geometry: geometry, view: view, pinFirstLevel: true });
  currentScene.switchTo({}, function() {
    document.getElementById('loading').classList.add('hidden');
  });
  
  document.getElementById('scene-name').textContent = sceneData.name;
  document.getElementById('scene-info').textContent = '';
  
  var homeBtn = document.getElementById('home-btn');
  if (HOME_SCENE_ID && HOME_SCENE_ID !== sceneId) {
    homeBtn.classList.remove('hidden');
  } else {
    homeBtn.classList.add('hidden');
  }
  
  document.querySelectorAll('.thumbnail').forEach(t => {
    t.classList.toggle('active', t.dataset.sceneId === sceneId);
  });
  
  renderHotspots(sceneData);
}

function goHome() {
  if (HOME_SCENE_ID) loadScene(HOME_SCENE_ID);
}

function renderHotspots(sceneData) {
  hotspotsContainer.innerHTML = '';
  if (!sceneData.hotspots || sceneData.hotspots.length === 0) return;
  
  sceneData.hotspots.forEach(hotspot => {
    const element = document.createElement('div');
    element.className = 'hotspot ' + (hotspot.type === 'transition' ? 'hotspot-transition' : 'hotspot-info');
    element.style.pointerEvents = 'auto';
    
    const size = hotspot.size || 40;
    const rotation = hotspot.rotation || 0;
    const opacity = hotspot.opacity !== undefined ? hotspot.opacity : 1;
    const color = hotspot.color || (hotspot.type === 'info' ? '#3b82f6' : '#f97316');
    const positionType = hotspot.positionType || 'embedded';
    
    let iconTransform = 'rotate(' + rotation + 'deg)';
    if (positionType === 'floor') {
      iconTransform = 'rotate(' + rotation + 'deg) rotateX(60deg)';
    }
    
    element.innerHTML = '<div class="hotspot-icon" style="width:' + size + 'px;height:' + size + 'px;background:' + color + ';opacity:' + opacity + ';transform:' + iconTransform + '">' + 
      '<div style="width:50%;height:50%;color:white">' + getIcon(hotspot.icon || (hotspot.type === 'info' ? 'info' : 'arrowRight')) + '</div>' +
      '</div>';
    
    if (hotspot.type === 'info' && hotspot.text) {
      const label = document.createElement('div');
      label.className = 'hotspot-label';
      label.textContent = hotspot.text;
      label.style.color = MARKER_STYLE.textColor;
      label.style.backgroundColor = MARKER_STYLE.backgroundColor + Math.round(MARKER_STYLE.backgroundOpacity * 255).toString(16).padStart(2, '0');
      label.style.border = MARKER_STYLE.borderWidth + 'px solid ' + MARKER_STYLE.borderColor;
      label.style.fontSize = (MARKER_STYLE.fontSize || 12) + 'px';
      element.appendChild(label);
    }
    
    if (hotspot.type === 'transition' && hotspot.targetSceneId) {
      element.onclick = () => loadScene(hotspot.targetSceneId);
    } else if (hotspot.type === 'info') {
      element.onclick = (e) => {
        e.stopPropagation();
        showInfoPopup(hotspot, e.clientX, e.clientY);
      };
    }
    
    hotspotsContainer.appendChild(element);
  });
  
  function updatePositions() {
    if (!currentScene) return;
    const view = currentScene.view();
    const hotspotElements = hotspotsContainer.querySelectorAll('.hotspot');
    
    currentSceneData.hotspots.forEach((hotspot, index) => {
      const el = hotspotElements[index];
      if (!el) return;
      
      const coords = view.coordinatesToScreen({ yaw: hotspot.yaw, pitch: hotspot.pitch });
      if (coords && coords.x >= 0 && coords.x <= window.innerWidth && coords.y >= 0 && coords.y <= window.innerHeight) {
        el.style.left = coords.x + 'px';
        el.style.top = coords.y + 'px';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });
    
    animationFrameId = requestAnimationFrame(updatePositions);
  }
  updatePositions();
}

function showInfoPopup(hotspot, x, y) {
  popupImageIndex = 0;
  const popup = document.getElementById('info-popup');
  popup.innerHTML = '';
  popup.dataset.hotspotId = hotspot.id;
  
  const header = document.createElement('div');
  header.className = 'info-popup-header';
  header.innerHTML = '<h3>' + (hotspot.text || 'Информация') + '</h3><button class="info-popup-close" onclick="closeInfoPopup()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
  popup.appendChild(header);
  
  if (hotspot.images && hotspot.images.length > 0) {
    const imagesDiv = document.createElement('div');
    imagesDiv.className = 'info-popup-images';
    imagesDiv.id = 'popup-images';
    
    const img = document.createElement('img');
    img.src = hotspot.images[popupImageIndex].url;
    img.className = 'info-popup-image';
    img.onclick = function() { openFullscreenImage(hotspot.images[popupImageIndex].url); };
    imagesDiv.appendChild(img);
    
    // Fullscreen button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'info-popup-fullscreen-btn';
    fullscreenBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    fullscreenBtn.onclick = function(e) { 
      e.stopPropagation(); 
      openFullscreenImage(hotspot.images[popupImageIndex].url); 
    };
    imagesDiv.appendChild(fullscreenBtn);
    
    if (hotspot.images.length > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'info-popup-nav prev';
      prevBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.onclick = function(e) { e.stopPropagation(); prevImage(); };
      imagesDiv.appendChild(prevBtn);
      
      const nextBtn = document.createElement('button');
      nextBtn.className = 'info-popup-nav next';
      nextBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.onclick = function(e) { e.stopPropagation(); nextImage(); };
      imagesDiv.appendChild(nextBtn);
      
      const dotsDiv = document.createElement('div');
      dotsDiv.className = 'info-popup-dots';
      hotspot.images.forEach(function(_, i) {
        const dot = document.createElement('div');
        dot.className = 'info-popup-dot' + (i === popupImageIndex ? ' active' : '');
        dotsDiv.appendChild(dot);
      });
      imagesDiv.appendChild(dotsDiv);
    }
    
    popup.appendChild(imagesDiv);
  }
  
  if (hotspot.description) {
    const content = document.createElement('div');
    content.className = 'info-popup-content';
    content.innerHTML = '<p>' + hotspot.description + '</p>';
    popup.appendChild(content);
  }
  
  if (!hotspot.description && (!hotspot.images || hotspot.images.length === 0)) {
    const empty = document.createElement('div');
    empty.className = 'info-popup-empty';
    empty.textContent = 'Нет дополнительной информации';
    popup.appendChild(empty);
  }
  
  popup.style.left = Math.min(x, window.innerWidth - 380) + 'px';
  popup.style.top = Math.min(y, window.innerHeight - 400) + 'px';
  popup.classList.remove('hidden');
}

function prevImage() {
  const popup = document.getElementById('info-popup');
  const hotspot = currentSceneData.hotspots.find(h => h.id === popup.dataset.hotspotId);
  if (!hotspot || !hotspot.images) return;
  popupImageIndex = popupImageIndex > 0 ? popupImageIndex - 1 : hotspot.images.length - 1;
  
  const img = document.querySelector('.info-popup-image');
  img.src = hotspot.images[popupImageIndex].url;
  
  const dots = document.querySelectorAll('.info-popup-dot');
  dots.forEach((dot, i) => {
    dot.className = 'info-popup-dot' + (i === popupImageIndex ? ' active' : '');
  });
}

function nextImage() {
  const popup = document.getElementById('info-popup');
  const hotspot = currentSceneData.hotspots.find(h => h.id === popup.dataset.hotspotId);
  if (!hotspot || !hotspot.images) return;
  popupImageIndex = popupImageIndex < hotspot.images.length - 1 ? popupImageIndex + 1 : 0;
  
  const img = document.querySelector('.info-popup-image');
  img.src = hotspot.images[popupImageIndex].url;
  
  const dots = document.querySelectorAll('.info-popup-dot');
  dots.forEach((dot, i) => {
    dot.className = 'info-popup-dot' + (i === popupImageIndex ? ' active' : '');
  });
}

let currentFullscreenImage = null;
let imageZoom = 1;

function openFullscreenImage(imageUrl) {
  currentFullscreenImage = imageUrl;
  imageZoom = 1;
  
  const overlay = document.createElement('div');
  overlay.id = 'fullscreen-overlay';
  overlay.className = 'fullscreen-overlay';
  overlay.onclick = closeFullscreenImage;
  
  overlay.innerHTML = 
    '<button class="fullscreen-close" onclick="closeFullscreenImage()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
    '<div class="fullscreen-controls">' +
      '<button onclick="zoomOut(event)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>' +
      '<div class="zoom-level">100%</div>' +
      '<button onclick="zoomIn(event)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>' +
      '<button onclick="resetZoom(event)">Сбросить</button>' +
    '</div>' +
    '<div class="fullscreen-image-container" onclick="event.stopPropagation()"><img src="' + imageUrl + '" id="fullscreen-image" style="transform: scale(1)"></div>';
  
  document.body.appendChild(overlay);
}

function closeFullscreenImage() {
  const overlay = document.getElementById('fullscreen-overlay');
  if (overlay) overlay.remove();
  currentFullscreenImage = null;
  imageZoom = 1;
}

function zoomIn(e) {
  e.stopPropagation();
  if (imageZoom >= 3) return;
  imageZoom = Math.min(3, imageZoom + 0.25);
  updateZoom();
}

function zoomOut(e) {
  e.stopPropagation();
  if (imageZoom <= 0.5) return;
  imageZoom = Math.max(0.5, imageZoom - 0.25);
  updateZoom();
}

function resetZoom(e) {
  e.stopPropagation();
  imageZoom = 1;
  updateZoom();
}

function updateZoom() {
  const img = document.getElementById('fullscreen-image');
  const zoomLevel = document.querySelector('.zoom-level');
  if (img) img.style.transform = 'scale(' + imageZoom + ')';
  if (zoomLevel) zoomLevel.textContent = Math.round(imageZoom * 100) + '%';
}

function closeInfoPopup() {
  document.getElementById('info-popup').classList.add('hidden');
}

function toggleAutorotate() {
  autorotateEnabled = !autorotateEnabled;
  const btn = document.getElementById('autorotate-btn');
  if (autorotateEnabled) {
    btn.classList.add('active');
    startAutorotate();
  } else {
    btn.classList.remove('active');
    stopAutorotate();
  }
}

function startAutorotate() {
  if (!currentScene || autorotateAnimationId) return;
  const baseSpeed = 0.0001;
  const speed = baseSpeed * (AUTOROTATE_SETTINGS.speed || 0.3);
  let lastTime = Date.now();
  
  function rotate() {
    const now = Date.now();
    const delta = now - lastTime;
    lastTime = now;
    
    const view = currentScene.view();
    const yaw = view.yaw();
    view.setYaw(yaw + (speed * delta));
    
    autorotateAnimationId = requestAnimationFrame(rotate);
  }
  
  autorotateAnimationId = requestAnimationFrame(rotate);
}

function stopAutorotate() {
  if (autorotateAnimationId) {
    cancelAnimationFrame(autorotateAnimationId);
    autorotateAnimationId = null;
  }
}

function toggleFullscreen() {
  const btn = document.getElementById('fullscreen-btn');
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    btn.classList.add('active');
  } else {
    document.exitFullscreen();
    btn.classList.remove('active');
  }
}

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', function() {
  const btn = document.getElementById('fullscreen-btn');
  if (document.fullscreenElement) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
});

// Gallery toggle
let galleryVisible = true;

function toggleGallery() {
  const gallery = document.getElementById('thumbnails');
  const btn = document.getElementById('gallery-toggle-btn');
  galleryVisible = !galleryVisible;
  
  if (galleryVisible) {
    gallery.classList.remove('collapsed');
    btn.classList.remove('active');
  } else {
    gallery.classList.add('collapsed');
    btn.classList.add('active');
  }
}

document.getElementById('viewer').addEventListener('click', closeInfoPopup);

init();