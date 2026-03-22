const SCENES_DATA = APP_DATA.scenes;
const MARKER_STYLE = APP_DATA.markerStyle;
const HOME_SCENE_ID = APP_DATA.homeSceneId;
const AUTOROTATE_SETTINGS = APP_DATA.autorotateSettings;

let viewer, currentScene, currentSceneData, hotspotsContainer, animationFrameId, currentSceneId;
let popupImageIndex = 0;
let autorotateEnabled = false;
let autorotateAnimationId = null;
let imageZoom = 1;
let galleryVisible = true;

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
  
  // Hide gallery toggle if only 1 scene
  if (SCENES_DATA.length <= 1) {
    var toggleBtn = document.getElementById('gallery-toggle');
    if (toggleBtn) toggleBtn.style.display = 'none';
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
  
  var levels = [{ width: 4096 }];
  var source = Marzipano.ImageUrlSource.fromString(sceneData.imageUrl);
  var geometry = new Marzipano.EquirectGeometry(levels);
  var limiter = Marzipano.RectilinearView.limit.traditional(4096, 100*Math.PI/180, 120*Math.PI/180);
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
  
  const header = document.createElement('div');
  header.className = 'info-popup-header';
  header.innerHTML = '<h3>' + (hotspot.text || 'Информация') + '</h3><button class="info-popup-close" onclick="closeInfoPopup()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
  popup.appendChild(header);
  
  if (hotspot.images && hotspot.images.length > 0) {
    const imagesDiv = document.createElement('div');
    imagesDiv.className = 'info-popup-images';
    imagesDiv.id = 'popup-images';
    renderPopupImages(hotspot.images, imagesDiv);
    popup.appendChild(imagesDiv);
  }
  
  if (hotspot.description) {
    const content = document.createElement('div');
    content.className = 'info-popup-content' + (hotspot.description.length > 200 ? ' scrollable' : '');
    content.innerHTML = '<p>' + hotspot.description + '</p>';
    popup.appendChild(content);
  }
  
  if (!hotspot.description && (!hotspot.images || hotspot.images.length === 0)) {
    const empty = document.createElement('div');
    empty.className = 'info-popup-empty';
    empty.textContent = 'Нет дополнительной информации';
    popup.appendChild(empty);
  }
  
  // Smart positioning
  var popupWidth = 360;
  var popupHeight = 300;
  var left = x;
  var top = y;
  
  // Adjust for right edge
  if (x + popupWidth > window.innerWidth) {
    left = Math.max(16, window.innerWidth - popupWidth - 16);
  }
  // Adjust for bottom edge
  if (y + popupHeight > window.innerHeight) {
    top = Math.max(16, window.innerHeight - popupHeight - 16);
  }
  
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.classList.remove('hidden');
  
  popup.dataset.hotspotId = hotspot.id;
}

function renderPopupImages(images, container) {
  container.innerHTML = '<img src="' + images[popupImageIndex].url + '" alt="" onclick="openFullscreenViewer(\'' + images[popupImageIndex].url + '\')" style="cursor:pointer">' +
    '<button class="info-popup-expand-btn" onclick="openFullscreenViewer(\'' + images[popupImageIndex].url + '\')" title="Открыть в полный экран"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button>';
  if (images.length > 1) {
    container.innerHTML += '<button class="info-popup-nav prev" onclick="prevImage(event)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>' +
      '<button class="info-popup-nav next" onclick="nextImage(event)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>' +
      '<div class="info-popup-dots">' + images.map((_, i) => '<div class="info-popup-dot' + (i === popupImageIndex ? ' active' : '') + '"></div>').join('') + '</div>';
  }
}

function prevImage(e) {
  e.stopPropagation();
  const popup = document.getElementById('info-popup');
  const hotspot = currentSceneData.hotspots.find(h => h.id === popup.dataset.hotspotId);
  if (!hotspot || !hotspot.images) return;
  popupImageIndex = popupImageIndex > 0 ? popupImageIndex - 1 : hotspot.images.length - 1;
  renderPopupImages(hotspot.images, document.getElementById('popup-images'));
}

function nextImage(e) {
  e.stopPropagation();
  const popup = document.getElementById('info-popup');
  const hotspot = currentSceneData.hotspots.find(h => h.id === popup.dataset.hotspotId);
  if (!hotspot || !hotspot.images) return;
  popupImageIndex = popupImageIndex < hotspot.images.length - 1 ? popupImageIndex + 1 : 0;
  renderPopupImages(hotspot.images, document.getElementById('popup-images'));
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

// Fullscreen Image Viewer
function openFullscreenViewer(imageUrl) {
  event.stopPropagation();
  imageZoom = 1;
  const viewer = document.getElementById('fullscreen-viewer');
  const img = document.getElementById('fullscreen-image');
  img.src = imageUrl;
  img.style.transform = 'scale(1)';
  document.getElementById('zoom-level').textContent = '100%';
  viewer.classList.remove('hidden');
}

function closeFullscreenViewer() {
  document.getElementById('fullscreen-viewer').classList.add('hidden');
}

function zoomIn(e) {
  e.stopPropagation();
  if (imageZoom < 3) {
    imageZoom = Math.min(3, imageZoom + 0.25);
    updateZoom();
  }
}

function zoomOut(e) {
  e.stopPropagation();
  if (imageZoom > 0.5) {
    imageZoom = Math.max(0.5, imageZoom - 0.25);
    updateZoom();
  }
}

function resetZoom(e) {
  e.stopPropagation();
  imageZoom = 1;
  updateZoom();
}

function updateZoom() {
  document.getElementById('fullscreen-image').style.transform = 'scale(' + imageZoom + ')';
  document.getElementById('zoom-level').textContent = Math.round(imageZoom * 100) + '%';
}

// Gallery Toggle
function toggleGallery() {
  galleryVisible = !galleryVisible;
  var gallery = document.getElementById('thumbnails');
  var btn = document.getElementById('gallery-toggle');
  var svg = btn.querySelector('svg');
  
  if (galleryVisible) {
    gallery.classList.remove('collapsed');
    btn.classList.remove('gallery-hidden');
    svg.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
  } else {
    gallery.classList.add('collapsed');
    btn.classList.add('gallery-hidden');
    svg.innerHTML = '<polyline points="6 15 12 9 18 15"/>';
  }
}

document.getElementById('viewer').addEventListener('click', closeInfoPopup);

init();