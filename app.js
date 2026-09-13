import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js';
import { CSS3DRenderer, CSS3DObject } from 'https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/renderers/CSS3DRenderer.js';

const cameraEl = document.querySelector('#camera');
const vrCameraEl = document.querySelector('#vr-camera');
const spaceEl = document.querySelector('#space');
const cameraPermission = document.querySelector('#camera-permission');
const libraryPanel = document.querySelector('#library-panel');
const hitboxPanel = document.querySelector('#hitbox-panel');
const mediaOverlay = document.querySelector('#media-overlay');
const hudPanel = document.querySelector('#xr-menu');
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
const hudLeftText = document.querySelector('#hud-left-text');
const hudRightText = document.querySelector('#hud-right-text');
const hudPanels = [document.querySelector('#hud-left'), document.querySelector('#hud-right')].filter(Boolean);

const supportsWebXR = 'xr' in navigator;
let scene;
let camera;
let leftCamera;
let rightCamera;
let renderer;
let cssRenderer;
let menuAnchor;
let mediaAnchor;
let pointAnchorGroup;
let sensorListening = false;
let cameraMode = 'rear';
let initialSensorQuaternion = null;
let headsetTilt = null;
let lastA = false;
let lastStart = false;
let lastRecenter = false;
let lastX = false;
let lastLeftStickClick = false;
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
  hudVisible: true,
  hitboxPlacementMode: false,
}

const stereoEyeOffset = 0.065;

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

function getGazePoint(distance = 3.5) {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const origin = camera.position.clone();
  const point = origin.clone().add(direction.multiplyScalar(distance));
  return point;
}

function refreshPointMarkers() {
  if (!pointAnchorGroup) return;
  pointAnchorGroup.clear();

  state.points.forEach(([x, y, z]) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshBasicMaterial({ color: '#86f7c8', transparent: true, opacity: 0.9 }),
    );
    marker.position.set(x, y, z);
    pointAnchorGroup.add(marker);
  });
}

function buildImmersiveEnvironment() {
  scene.background = new THREE.Color(0x090909);
  scene.fog = new THREE.Fog(0x090909, 7, 18);

  const ambient = new THREE.AmbientLight(0xf1e2cf, 0.4);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xf5dcc0, 1.1);
  keyLight.position.set(1.5, 3.2, 2.6);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0xd4b896, 0.7, 18, 2);
  fillLight.position.set(-2.8, 1.8, -2.4);
  scene.add(fillLight);

  const backgroundGlow = new THREE.Mesh(
    new THREE.SphereGeometry(18, 28, 28),
    new THREE.MeshBasicMaterial({ color: 0x1b1917, side: THREE.BackSide, transparent: true, opacity: 0.9 }),
  );
  scene.add(backgroundGlow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 2.86, 96),
    new THREE.MeshBasicMaterial({ color: 0xf7eee7, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.08;
  scene.add(ring);

  const innerGlow = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 2.18, 96),
    new THREE.MeshBasicMaterial({ color: 0x8b7562, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
  );
  innerGlow.rotation.x = -Math.PI / 2;
  innerGlow.position.y = -1.07;
  scene.add(innerGlow);

  const horizon = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.03, 20, 120),
    new THREE.MeshBasicMaterial({ color: 0xe7d7c1, transparent: true, opacity: 0.22 }),
  );
  horizon.rotation.x = Math.PI / 2;
  horizon.position.set(0, -0.96, 0);
  scene.add(horizon);

  scene.userData.worldEffects = { backgroundGlow, ring, innerGlow, horizon, keyLight, fillLight };
}

function renderFrame() {
  camera.quaternion.slerp(camera.userData.targetQuaternion, 0.12);
  camera.updateMatrixWorld();

  const worldEffects = scene?.userData?.worldEffects;
  if (worldEffects) {
    const t = performance.now() * 0.0006;
    worldEffects.ring.rotation.z = t * 1.1;
    worldEffects.ring.scale.setScalar(1 + Math.sin(t * 1.8) * 0.04);
    worldEffects.innerGlow.rotation.z = -t * 0.8;
    worldEffects.horizon.rotation.z = t * 0.7;
    worldEffects.backgroundGlow.rotation.y = t * 0.18;
    worldEffects.keyLight.position.x = 1.4 + Math.sin(t * 2) * 0.4;
    worldEffects.fillLight.intensity = 0.62 + Math.sin(t * 1.7) * 0.08;
  }

  if (state.stereoEnabled && !renderer.xr.isPresenting) {
    const width = renderer.domElement.clientWidth || innerWidth;
    const height = renderer.domElement.clientHeight || innerHeight;
    const halfWidth = Math.max(1, width / 2);

    leftCamera.position.copy(camera.position);
    rightCamera.position.copy(camera.position);
    leftCamera.quaternion.copy(camera.quaternion);
    rightCamera.quaternion.copy(camera.quaternion);
    leftCamera.position.x = -stereoEyeOffset;
    rightCamera.position.x = stereoEyeOffset;

    leftCamera.updateMatrixWorld();
    rightCamera.updateMatrixWorld();

    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, halfWidth, height);
    renderer.setScissor(0, 0, halfWidth, height);
    leftCamera.updateProjectionMatrix();
    renderer.render(scene, leftCamera);

    renderer.setViewport(halfWidth, 0, halfWidth, height);
    renderer.setScissor(halfWidth, 0, halfWidth, height);
    rightCamera.updateProjectionMatrix();
    renderer.render(scene, rightCamera);

    renderer.setScissorTest(false);
  } else {
    renderer.render(scene, camera);
  }

  updateGamepadState();
  cssRenderer.render(scene, camera);
}

function setupScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 0);
  camera.userData.targetQuaternion = new THREE.Quaternion();

  leftCamera = camera.clone();
  rightCamera = camera.clone();

  const ambient = new THREE.HemisphereLight(0x9ad8ff, 0x061922, 1.1);
  const key = new THREE.PointLight(0x7ef3ff, 2.2, 14, 2);
  key.position.set(0, 2.4, 3);
  scene.add(ambient, key);

  pointAnchorGroup = new THREE.Group();
  scene.add(pointAnchorGroup);
  buildImmersiveEnvironment();

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.xr.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  spaceEl.appendChild(renderer.domElement);

  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(innerWidth, innerHeight);
  cssRenderer.domElement.className = 'css-world';
  spaceEl.appendChild(cssRenderer.domElement);

  const menuEl = document.querySelector('#xr-menu');
  const mediaEl = document.querySelector('#media-overlay');

  if (menuEl) {
    menuEl.style.pointerEvents = 'auto';
    menuEl.style.position = 'fixed';
    menuEl.style.right = '22px';
    menuEl.style.top = '22px';
    menuEl.style.left = 'auto';
    menuEl.style.transform = 'none';
  }

  if (mediaEl) {
    mediaEl.style.pointerEvents = 'auto';
    mediaEl.style.position = 'fixed';
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
    .add(direction.clone().multiplyScalar(2.9))
    .add(right.clone().multiplyScalar(state.menuOffset.x * 0.8 + 0.9))
    .add(up.clone().multiplyScalar(state.menuOffset.y * 0.8 + 0.35));

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
    .add(direction.clone().multiplyScalar(3.1))
    .add(right.clone().multiplyScalar(0.15))
    .add(up.clone().multiplyScalar(0.2));

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
  const startPressed = Boolean(pad.buttons[9]?.pressed || pad.buttons[8]?.pressed || pad.buttons[16]?.pressed);
  const aPressed = Boolean(pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[7]?.pressed);
  const xPressed = Boolean(pad.buttons[2]?.pressed);
  const recenterPressed = Boolean(pad.buttons[3]?.pressed);
  const leftStickClickPressed = Boolean(pad.buttons[10]?.pressed || pad.buttons[11]?.pressed);

  if (startPressed && !lastStart) {
    setHudVisible(!state.hudVisible);
  }

  if (leftStickClickPressed && !lastLeftStickClick) {
    state.hitboxPlacementMode = !state.hitboxPlacementMode;
    updateHudStatus();
  }

  if (state.hudVisible) {
    state.menuOffset.x = clamp(state.menuOffset.x + leftStickX * 0.02, -1.2, 1.2);
    state.menuOffset.y = clamp(state.menuOffset.y - leftStickY * 0.02, -0.8, 0.8);
  }

  if (recenterPressed && !lastRecenter) {
    initialSensorQuaternion = headsetTilt ? headsetTilt.clone() : sensorQuaternion.clone();
  }

  if (state.hitboxPlacementMode && xPressed && !lastX) {
    finishHitboxPlacement();
  }

  if (aPressed && !lastA) {
    if (state.hitboxPlacementMode) {
      const gazePoint = getGazePoint();
      const point = [Number(gazePoint.x.toFixed(2)), Number(gazePoint.y.toFixed(2)), Number(gazePoint.z.toFixed(2))];
      addPointToList(point);
      updateHudStatus();
    } else {
      triggerClosestHitbox();
    }
  }

  lastStart = startPressed;
  lastA = aPressed;
  lastX = xPressed;
  lastLeftStickClick = leftStickClickPressed;
  lastRecenter = recenterPressed;
}

function addPointToList(point) {
  const index = state.points.length;
  state.points.push(point);
  refreshPointMarkers();

  const pill = document.createElement('div');
  pill.className = 'point-pill';
  pill.innerHTML = `<strong>Point ${index + 1}</strong><span>${point.map((axis) => axis.toFixed(1)).join(', ')}</span><button type="button" data-point-index="${index}" aria-label="Remove point">×</button>`;

  pill.querySelector('button').addEventListener('click', () => {
    state.points.splice(index, 1);
    refreshPointList();
    refreshPointMarkers();
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
      refreshPointMarkers();
    });
    pointList.appendChild(pill);
  });
}

function createHitbox(item) {
  const points = item.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const geometry = new THREE.BufferGeometry().setFromPoints([...points, points[0]]);
  const material = new THREE.LineBasicMaterial({ color: '#7ef3ff', transparent: true, opacity: 0.9 });
  const line = new THREE.LineLoop(geometry, material);

  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  line.position.set(0, 0, 0);

  const group = new THREE.Group();
  group.add(line);
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

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const origin = camera.position.clone();
  let closest = null;
  let shortest = Infinity;

  state.hitboxes.forEach((item) => {
    const toCenter = item.center.clone().sub(origin);
    const projection = toCenter.dot(forward);
    const distance = origin.distanceTo(item.center);
    if (projection <= 0) return;

    const lateral = toCenter.clone().sub(forward.clone().multiplyScalar(projection)).length();
    const score = distance + lateral * 0.7;

    if (score < shortest) {
      shortest = score;
      closest = item;
    }
  });

  if (!closest || shortest > 4.1) return;
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
  refreshPointMarkers();
  updateHudStatus();

  return created;
}

function updateHudStatus() {
  if (!hudLeftText || !hudRightText) return;

  const pointCount = state.points.length;
  const minPoints = 4;

  if (!state.hudVisible) {
    const base = [
      '<div><span class="button-tag">Start</span> toggle HUD</div>',
      '<div><span class="button-tag">A</span> open / place</div>',
      '<div><span class="button-tag">Y</span> recenter</div>',
      '<div><span class="button-tag">L3/B10</span> hitbox mode</div>',
    ].join('');
    hudLeftText.innerHTML = base;
    hudRightText.innerHTML = base;
    return;
  }

  if (state.hitboxPlacementMode) {
    const finishText = pointCount >= minPoints
      ? '<span class="button-tag">X</span> finish item'
      : '<span class="button-tag">X</span> need ' + Math.max(0, minPoints - pointCount) + ' more';
    const builder = [
      '<div><span class="button-tag">Mode</span> place</div>',
      '<div><span class="button-tag">Points</span> ' + pointCount + '</div>',
      '<div>' + finishText + '</div>',
      '<div><span class="button-tag">A</span> add point</div>',
      '<div><span class="button-tag">Start</span> close HUD</div>',
    ].join('');
    hudLeftText.innerHTML = builder;
    hudRightText.innerHTML = builder;
    return;
  }

  const normal = [
    '<div><span class="button-tag">Mode</span> explore</div>',
    '<div><span class="button-tag">Start</span> HUD</div>',
    '<div><span class="button-tag">A</span> open nearest</div>',
    '<div><span class="button-tag">Y</span> recenter</div>',
    '<div><span class="button-tag">L3/B10</span> place</div>',
  ].join('');
  hudLeftText.innerHTML = normal;
  hudRightText.innerHTML = normal;
}

function setHudVisible(visible) {
  state.hudVisible = visible;
  hudPanels.forEach((panel) => panel.classList.toggle('hidden', !visible));
  updateHudStatus();
}

function finishHitboxPlacement() {
  if (state.points.length < 4) {
    alert('Need at least 4 points to finish this hitbox/item.');
    return;
  }

  const name = `Item ${state.hitboxes.length + 1}`;
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    points: [...state.points],
    assetId: state.assets[0]?.id || null,
  };

  const created = createHitbox(item);
  created.position.set(0, 0, 0);
  state.hitboxes.push(item);
  state.points = [];
  refreshPointList();
  refreshPointMarkers();
  state.hitboxPlacementMode = false;
  updateHudStatus();
}

function setVrMode(enabled) {
  document.body.classList.toggle('vr-mode', enabled);
  if (enabled) {
    document.body.classList.add('xr-session');
    setHudVisible(true);
  } else {
    document.body.classList.remove('xr-session');
    setHudVisible(false);
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
  const toggleLibraryButton = document.querySelector('#toggle-library');
  if (toggleLibraryButton) {
    toggleLibraryButton.addEventListener('click', () => {
      libraryPanel.classList.toggle('hidden');
    });
  }

  const toggleHitboxButton = document.querySelector('#toggle-hitbox');
  if (toggleHitboxButton) {
    toggleHitboxButton.addEventListener('click', () => {
      hitboxPanel.classList.toggle('hidden');
    });
  }

  document.querySelectorAll('[data-xr-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.xrMode;
      if (mode === 'vr') {
        setVrMode(true);
        return;
      }
      if (currentXRSession) {
        currentXRSession.end();
        return;
      }
      startXRSession(mode);
    });
  });

  const recenterButton = document.querySelector('#recenter-button');
  if (recenterButton) {
    recenterButton.addEventListener('click', () => {
      initialSensorQuaternion = headsetTilt ? headsetTilt.clone() : sensorQuaternion.clone();
    });
  }

  document.querySelectorAll('.panel-close').forEach((button) => {
    button.addEventListener('click', () => {
      const panelId = button.dataset.panel;
      const panel = panelId ? document.querySelector(`#${panelId}`) : null;
      if (panel) closePanel(panel);
    });
  });

  if (cameraPermission) {
    cameraPermission.addEventListener('click', () => setCameraMode('rear'));
  }
  document.addEventListener('pointerdown', requestSensorPermission, { passive: true });
  if (assetInput) {
    assetInput.addEventListener('change', handleAssetSelection);
  }
  if (hitboxForm) {
    hitboxForm.addEventListener('submit', createHitboxFromForm);
  }

  const addPointButton = document.querySelector('#add-point');
  if (addPointButton) {
    addPointButton.addEventListener('click', () => {
      const gazePoint = getGazePoint();
      const x = Number(gazePoint.x.toFixed(2));
      const y = Number(gazePoint.y.toFixed(2));
      const z = Number(gazePoint.z.toFixed(2));

      addPointToList([x, y, z]);
    });
  }

  if (mediaOverlay && mediaOverlay.querySelector('.panel-close')) {
    mediaOverlay.querySelector('.panel-close').addEventListener('click', closeMediaViewer);
  }
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
setHudVisible(true);
setVrMode(true);
setCameraMode('rear');
renderAssetList();
