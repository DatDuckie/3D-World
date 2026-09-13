import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js';
import { CSS3DRenderer, CSS3DObject } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/renderers/CSS3DRenderer.js';

const cameraEl = document.querySelector('#camera');
const vrCameraEl = document.querySelector('#vr-camera');
const spaceEl = document.querySelector('#space');
const cameraPermission = document.querySelector('#camera-permission');
const libraryPanel = document.querySelector('#library-panel');
const hitboxPanel = document.querySelector('#hitbox-panel');
const mediaOverlay = document.querySelector('#media-overlay');
const assetInput = document.querySelector('#asset-input');
const assetList = document.querySelector('#asset-list');
const pointList = document.querySelector('#point-list');
const hitboxForm = document.querySelector('#hitbox-form');
const hitboxNameInput = document.querySelector('#hitbox-name');
const mediaImage = document.querySelector('#media-image');
const mediaVideo = document.querySelector('#media-video');
const mediaAudio = document.querySelector('#media-audio');
const mediaTitle = document.querySelector('#media-title');
const vrReticleLeft = document.querySelector('#vr-reticle-left');
const vrReticleRight = document.querySelector('#vr-reticle-right');

const supportsWebXR = 'xr' in navigator;
let scene;
let camera;
let renderer;
let cssRenderer;
let menuAnchor;
let mediaAnchor;
let sensorListening = false;
let cameraMode = 'rear';
let initialSensorQuaternion = null;
let headsetTilt = null;
let lastA = false;
let lastStart = false;
let lastRecenter = false;
let lastX = false;
let activeMedia = null;
let currentXRSession = null;
let xrMode = 'desktop';

const state = {
  assets: [],
  hitboxes: [],
  points: [],
  menuOffset: new THREE.Vector2(0, 0),
  menuRadius: 1.8,
  menuHolding: false,
  selectedAssetId: null,
  stereoEnabled: true,
}

const sensorEuler = new THREE.Euler();
const sensorQuaternion = new THREE.Quaternion();
const screenAxis = new THREE.Vector3(0, 0, 1);
const sensorCorrection = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createCssAnchor(element, position, scale = 0.0065) {
  const object = new CSS3DObject(element);
  object.position.copy(position);
  object.scale.setScalar(scale);
  scene.add(object);
  return object;
}

function renderFrame() {
  camera.quaternion.slerp(camera.userData.targetQuaternion, 0.12);
  camera.updateMatrixWorld();
  updateMenuTransform();
  updateMediaTransform();
  updateGamepadState();
  renderer.render(scene, camera);
  cssRenderer.render(scene, camera);
}

function setupScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 100);
  camera.userData.targetQuaternion = new THREE.Quaternion();

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.xr.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  spaceEl.appendChild(renderer.domElement);

  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(innerWidth, innerHeight);
  cssRenderer.domElement.className = 'css-world';
  spaceEl.appendChild(cssRenderer.domElement);

  if (!menuAnchor) {
    menuAnchor = createCssAnchor(document.querySelector('#xr-menu'), new THREE.Vector3(0, 0.4, -2.6));
  }
  if (!mediaAnchor) {
    mediaAnchor = createCssAnchor(mediaOverlay, new THREE.Vector3(0, 0.25, -2.6));
  }

  animate();
}

function updateMenuTransform() {
  if (!menuAnchor) return;
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  camera.getWorldDirection(direction);
  right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  const position = camera.position
    .clone()
    .add(direction.clone().multiplyScalar(2.6))
    .add(right.clone().multiplyScalar(state.menuOffset.x))
    .add(up.clone().multiplyScalar(state.menuOffset.y));

  menuAnchor.position.copy(position);
  menuAnchor.lookAt(camera.position);
}

function updateMediaTransform() {
  if (!mediaAnchor) return;

  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  camera.getWorldDirection(direction);
  right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  const position = camera.position
    .clone()
    .add(direction.clone().multiplyScalar(2.7))
    .add(right.clone().multiplyScalar(0))
    .add(up.clone().multiplyScalar(0.15));

  mediaAnchor.position.copy(position);
  mediaAnchor.lookAt(camera.position);
}

function animate() {
  if (renderer.xr.isPresenting) {
    renderFrame();
    return;
  }

  requestAnimationFrame(animate);
  renderFrame();
}

async function setCameraMode(mode) {
  if (mode === 'off') {
    cameraEl.srcObject?.getTracks().forEach((track) => track.stop());
    cameraEl.srcObject = null;
    vrCameraEl.srcObject = null;
    cameraMode = 'off';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: mode === 'rear' ? 'environment' : 'user' } },
      audio: false,
    });
    cameraEl.srcObject?.getTracks().forEach((track) => track.stop());
    cameraEl.srcObject = stream;
    vrCameraEl.srcObject = stream;
    cameraMode = mode;
    cameraEl.classList.toggle('front-camera', mode === 'front');
    vrCameraEl.classList.toggle('front-camera', mode === 'front');
    cameraPermission.hidden = true;
  } catch (error) {
    cameraPermission.hidden = false;
  }
}

function requestSensorPermission() {
  if (sensorListening) return;
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().catch(() => {});
  }
  window.addEventListener('deviceorientation', trackTilt, true);
  sensorListening = true;
}

function trackTilt(event) {
  sensorEuler.set(
    THREE.MathUtils.degToRad(event.beta || 0),
    THREE.MathUtils.degToRad(event.alpha || 0),
    THREE.MathUtils.degToRad(-(event.gamma || 0)),
    'YXZ',
  );
  sensorQuaternion.setFromEuler(sensorEuler);
  sensorQuaternion.multiply(sensorCorrection);
  sensorQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(screenAxis, -THREE.MathUtils.degToRad(screen.orientation?.angle || 0)));

  if (!initialSensorQuaternion) {
    initialSensorQuaternion = sensorQuaternion.clone();
  }

  camera.userData.targetQuaternion.copy(initialSensorQuaternion.clone().invert().multiply(sensorQuaternion));
  headsetTilt = sensorQuaternion.clone();
}

function readGamepad() {
  if (!('getGamepads' in navigator)) return null;
  const pads = navigator.getGamepads();
  return Array.from(pads).find(Boolean) ?? null;
}

function updateGamepadState() {
  const pad = readGamepad();
  if (!pad) return;

  const leftStickX = pad.axes[0] ?? 0;
  const leftStickY = pad.axes[1] ?? 0;
  const startPressed = Boolean(pad.buttons[9]?.pressed || pad.buttons[16]?.pressed);
  const aPressed = Boolean(pad.buttons[0]?.pressed || pad.buttons[1]?.pressed); 
  const xPressed = Boolean(pad.buttons[2]?.pressed || pad.buttons[3]?.pressed || pad.buttons[16]?.pressed);

  if (startPressed && !lastStart) {
    state.menuHolding = !state.menuHolding;
  }

  if (state.menuHolding) {
    state.menuOffset.x = clamp(state.menuOffset.x + leftStickX * 0.04, -1.5, 1.5);
    state.menuOffset.y = clamp(state.menuOffset.y - leftStickY * 0.04, -1.2, 1.2);
  }

  if (xPressed && !lastX) {
    initialSensorQuaternion = headsetTilt ? headsetTilt.clone() : sensorQuaternion.clone();
  }

  if (aPressed && !lastA) {
    triggerClosestHitbox();
  }

  lastStart = startPressed;
  lastA = aPressed;
  lastX = xPressed;
}

function addPointToList(point) {
  const index = state.points.length;
  state.points.push(point);

  const pill = document.createElement('div');
  pill.className = 'point-pill';
  pill.innerHTML = `<strong>Point ${index + 1}</strong><span>${point.map((axis) => axis.toFixed(1)).join(', ')}</span><button type="button" data-point-index="${index}" aria-label="Remove point">×</button>`;

  pill.querySelector('button').addEventListener('click', () => {
    state.points.splice(index, 1);
    refreshPointList();
  });

  pointList.appendChild(pill);
}

function refreshPointList() {
  pointList.innerHTML = '';
  state.points.forEach((point, index) => {
    const pill = document.createElement('div');
    pill.className = 'point-pill';
    pill.innerHTML = `<strong>Point ${index + 1}</strong><span>${point.map((axis) => axis.toFixed(1)).join(', ')}</span><button type="button" data-point-index="${index}" aria-label="Remove point">×</button>`;
    pill.querySelector('button').addEventListener('click', () => {
      state.points.splice(index, 1);
      refreshPointList();
    });
    pointList.appendChild(pill);
  });
}

function createHitbox(item) {
  const points = item.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const geometry = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
  const material = new THREE.LineBasicMaterial({ color: '#7ef3ff', transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geometry, material);

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({ color: '#9a8bff', transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
  );

  const bounds = new THREE.Vector3();
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  fill.position.copy(center);
  fill.lookAt(camera.position);
  line.position.set(0, 0, 0);

  const group = new THREE.Group();
  group.add(line, fill);
  group.userData.item = item;
  scene.add(group);

  item.mesh = group;
  item.center = center;
  return group;
}

function getMediaType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.name.match(/\.(pdf|txt|json)$/i)) return 'document';
  return 'unknown';
}

function renderAssetList() {
  assetList.innerHTML = '';

  state.assets.forEach((asset) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'asset-item';
    item.dataset.assetId = asset.id;
    item.innerHTML = `
      ${asset.kind === 'image' ? `<img src="${asset.url}" alt="${asset.name}" />` : `<video src="${asset.url}" muted playsinline></video>`}
      <div class="asset-copy"><strong>${asset.name}</strong><span>${asset.kind.toUpperCase()}</span></div>
    `;

    item.addEventListener('click', () => {
      state.selectedAssetId = asset.id;
      const itemName = document.querySelector('#hitbox-name');
      if (!itemName.value.trim()) itemName.value = asset.name.replace(/\.[^.]+$/, '');
      document.querySelectorAll('.asset-item').forEach((button) => button.style.borderColor = 'rgba(255,255,255,0.18)');
      item.style.borderColor = '#7ef3ff';
    });

    assetList.appendChild(item);
  });
}

function handleAssetSelection(event) {
  const files = Array.from(event.target.files || []);
  const nextAssets = files.map((file) => {
    const type = getMediaType(file);
    if (type === 'unknown') return null;
    const url = URL.createObjectURL(file);
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      kind: type,
      url,
      file,
    };
  }).filter(Boolean);

  state.assets.push(...nextAssets);
  renderAssetList();
  event.target.value = '';
}

function openPanel(panelEl) {
  panelEl.classList.remove('hidden');
}

function closePanel(panelEl) {
  panelEl.classList.add('hidden');
}

function triggerClosestHitbox() {
  if (!state.hitboxes.length) return;
  const playerPos = camera.position.clone();
  let closest = null;
  let shortest = Infinity;

  state.hitboxes.forEach((item) => {
    const distance = playerPos.distanceTo(item.center);
    if (distance < shortest) {
      shortest = distance;
      closest = item;
    }
  });

  if (!closest || shortest > 3.1) return;
  openMediaViewer(closest);
}

function openMediaViewer(item) {
  const asset = state.assets.find((entry) => entry.id === item.assetId) ?? state.assets[0];
  if (!asset) return;

  activeMedia = item;
  mediaTitle.textContent = item.name;

  mediaImage.hidden = true;
  mediaVideo.hidden = true;
  mediaAudio.hidden = true;

  if (asset.kind === 'image') {
    mediaImage.src = asset.url;
    mediaImage.hidden = false;
  } else if (asset.kind === 'video') {
    mediaVideo.src = asset.url;
    mediaVideo.hidden = false;
    mediaVideo.play().catch(() => {});
  } else if (asset.kind === 'audio') {
    mediaAudio.src = asset.url;
    mediaAudio.hidden = false;
    mediaAudio.play().catch(() => {});
  }

  mediaOverlay.classList.remove('hidden');
}

function closeMediaViewer() {
  mediaOverlay.classList.add('hidden');
  mediaImage.src = '';
  mediaVideo.pause();
  mediaVideo.removeAttribute('src');
  mediaAudio.pause();
  mediaAudio.removeAttribute('src');
  activeMedia = null;
}

function createHitboxFromForm(event) {
  event.preventDefault();

  if (state.points.length < 4) {
    alert('A hitbox needs at least 4 points. Connect the last point back to the first.');
    return;
  }

  const name = hitboxNameInput.value.trim();
  if (!name) {
    alert('Give the hitbox a name.');
    return;
  }

  const selectedAsset = state.assets.find((asset) => asset.id === state.selectedAssetId) || state.assets[0];
  if (!selectedAsset) {
    alert('Add an image or video to the library first.');
    return;
  }

  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    points: [...state.points],
    assetId: selectedAsset.id,
  };

  const created = createHitbox(item);
  created.position.set(0, 0, 0);
  state.hitboxes.push(item);
  closePanel(hitboxPanel);
  hitboxNameInput.value = '';
  state.points = [];
  refreshPointList();

  return created;
}

function setVrMode(enabled) {
  document.body.classList.toggle('vr-mode', enabled);
  if (enabled) {
    document.body.classList.add('xr-session');
  } else {
    document.body.classList.remove('xr-session');
  }
  if (vrReticleLeft) vrReticleLeft.style.opacity = enabled ? '1' : '0';
  if (vrReticleRight) vrReticleRight.style.opacity = enabled ? '1' : '0';
}

async function startXRSession(mode) {
  if (!supportsWebXR || !navigator.xr) {
    setVrMode(mode === 'vr');
    alert('WebXR is not available in this browser. AR/VR mode will fall back to the stereo split view.');
    return;
  }

  const sessionMode = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';

  try {
    const session = await navigator.xr.requestSession(sessionMode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hit-test', 'dom-overlay'],
      domOverlay: { root: document.body },
    });

    currentXRSession = session;
    xrMode = mode;
    setVrMode(mode === 'vr');
    document.body.classList.add('xr-session');
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);

    session.addEventListener('end', () => {
      currentXRSession = null;
      xrMode = 'desktop';
      setVrMode(false);
      document.body.classList.remove('xr-session');
      renderer.setAnimationLoop(null);
      animate();
    });

    renderer.setAnimationLoop(() => {
      renderFrame();
    });
  } catch (error) {
    console.warn('XR session failed:', error);
    setVrMode(mode === 'vr');
    alert('This device does not support the selected XR mode. The app will continue in the stereo split view.');
  }
}

function setUpInteractions() {
  document.querySelector('#toggle-library').addEventListener('click', () => {
    libraryPanel.classList.toggle('hidden');
  });

  document.querySelector('#toggle-hitbox').addEventListener('click', () => {
    hitboxPanel.classList.toggle('hidden');
  });

  document.querySelectorAll('[data-xr-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.xrMode;
      if (mode === 'vr') {
        setVrMode(true);
        return;
      }
      if (mode === 'ar') {
        setVrMode(false);
        startXRSession('ar');
        return;
      }
      if (currentXRSession) {
        currentXRSession.end();
        return;
      }
      startXRSession(mode);
    });
  });

  document.querySelector('#recenter-button').addEventListener('click', () => {
    initialSensorQuaternion = headsetTilt ? headsetTilt.clone() : sensorQuaternion.clone();
  });

  document.querySelectorAll('.panel-close').forEach((button) => {
    button.addEventListener('click', () => {
      const panelId = button.dataset.panel;
      const panel = panelId ? document.querySelector(`#${panelId}`) : null;
      if (panel) closePanel(panel);
    });
  });

  cameraPermission.addEventListener('click', () => setCameraMode('rear'));
  document.addEventListener('pointerdown', requestSensorPermission, { passive: true });
  assetInput.addEventListener('change', handleAssetSelection);
  hitboxForm.addEventListener('submit', createHitboxFromForm);

  document.querySelector('#add-point').addEventListener('click', () => {
    const x = Number(document.querySelector('#point-x').value);
    const y = Number(document.querySelector('#point-y').value);
    const z = Number(document.querySelector('#point-z').value);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      alert('Point values must be valid numbers.');
      return;
    }
    addPointToList([x, y, z]);
  });

  mediaOverlay.querySelector('.panel-close').addEventListener('click', closeMediaViewer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMediaViewer();
  });
}

window.addEventListener('resize', () => {
  if (!camera) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  cssRenderer.setSize(innerWidth, innerHeight);
});

setupScene();
setUpInteractions();
requestSensorPermission();
setCameraMode('rear');
renderAssetList();
