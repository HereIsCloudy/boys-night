import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.154.0/examples/jsm/controls/OrbitControls.js';

const CELL_SIZE = 1;
const WALL_HEIGHT = 2.4;
const DOOR_HEIGHT = 1.9;
const DOOR_WIDTH = 0.48;
// Theme-driven colors: populated by updateThemeColors() using CSS variables
// state.themeColors will contain integer hex values for keys used below

const DEFAULT_CATALOG = {
  Wall: { unit_cost: 5 },
  Walkway: { unit_cost: 0 },
  Door: { unit_cost: 50 }
};

const TOOL_TYPES = [
  { key: 'Wall', label: 'Wall' },
  { key: 'Walkway', label: 'Walkway' },
  { key: 'Door', label: 'Door' },
  { key: 'Erase', label: 'Erase' }
];

const paletteEl = document.getElementById('palette');
const activeToolLabel = document.getElementById('active-tool-label');
const gridSizeLabel = document.getElementById('grid-size-label');
const widthInput = document.getElementById('width-input');
const heightInput = document.getElementById('height-input');
const walkwayInput = document.getElementById('walkway-input');
const doorCountInput = document.getElementById('door-count-input');
const resizeBtn = document.getElementById('resize-btn');
const autoBuildBtn = document.getElementById('autobuild-btn');
const customBtn = document.getElementById('custom-btn');
const resetBtn = document.getElementById('reset-btn');
const asciiOutput = document.getElementById('ascii-output');
const billOutput = document.getElementById('bill-output');
const objectCountLabel = document.getElementById('object-count-label');
const totalCostLabel = document.getElementById('total-cost-label');
const walkwayCountLabel = document.getElementById('walkway-count-label');
const doorCountLabel = document.getElementById('door-count-label');
const viewer = document.getElementById('viewer');

// Sidebar elements (compact toggle)
const sidebarEl = document.querySelector('.sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');

const state = {
  width: 12,
  height: 18,
  activeTool: 'Wall',
  grid: [],
  horizontalWalls: [],
  verticalWalls: [],
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  raycaster: null,
  pointer: null,
  floorPlane: null,
  hoverObject: null,
  hoveredCell: null,
  hoveredEdge: null,
  hoverMode: 'edge',
  objectGroup: null,
  gridGroup: null,
  preferredOrientation: null, // 'horizontal' | 'vertical' | null (press R to toggle)
  themeColors: {} // populated by updateThemeColors()
};

// Read a CSS variable and convert it to a THREE-compatible integer color
function cssColorToHexInt(varName, fallback) {
  try {
    const s = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!s) return fallback || 0x111827;
    // hex string
    if (s.startsWith('#')) {
      return parseInt(s.slice(1).length === 3 ? s.slice(1).split('').map(c => c + c).join('') : s.slice(1), 16);
    }
    // rgb/rgba
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(p => parseFloat(p.trim()));
      const r = Math.round(parts[0] || 0);
      const g = Math.round(parts[1] || 0);
      const b = Math.round(parts[2] || 0);
      return (r << 16) + (g << 8) + b;
    }
    return fallback || 0x111827;
  } catch (e) {
    return fallback || 0x111827;
  }
}

function updateThemeColors() {
  // Map CSS variables to scene colors
  const accent = cssColorToHexInt('--accent', 0x8b5cf6);
  const accent2 = cssColorToHexInt('--accent-2', 0x06b6d4);
  const panel = cssColorToHexInt('--panel-surface', 0x0b1220);
  const border = cssColorToHexInt('--panel-border', 0x94a3b8);
  const bg = cssColorToHexInt('--bg', 0x050816);

  state.themeColors = {
    background: bg,
    floor: panel,
    gridLine: accent,
    gridEdge: border,
    hover: accent2,
    wall: 0x6b7280, // neutral by default
    door: accent,
    walkway: accent2,
    frame: 0x1e293b
  };
}

function applyThemeToSceneIfReady() {
  if (!state.scene) return;
  // update background
  if (state.themeColors.background != null) state.scene.background = new THREE.Color(state.themeColors.background);
  // update ground material
  if (state.floorPlane && state.floorPlane.material) state.floorPlane.material.color.setHex(state.themeColors.floor);
  // update grid line color
  if (state.gridGroup && state.gridGroup.material) {
    state.gridGroup.material.color.setHex(state.themeColors.gridLine);
  }
  // update frame color if present
  // refresh meshes so materials pick up new colors (build functions use themeColors)
  refreshSceneObjects();
  updateHoverStyle();
}

function createGridArray(width, height) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
}

function createWallArrays(width, height) {
  const horizontalWalls = Array.from({ length: height + 1 }, () => Array.from({ length: width }, () => null));
  const verticalWalls = Array.from({ length: height }, () => Array.from({ length: width + 1 }, () => null));
  return { horizontalWalls, verticalWalls };
}

function updateLabels() {
  gridSizeLabel.textContent = `${state.width} × ${state.height}`;
}

function destroyScene() {
  if (state.renderer) {
    const dom = state.renderer.domElement;
    dom.removeEventListener('pointermove', handlePointerMove);
    dom.removeEventListener('pointerdown', handlePointerDown);
    dom.removeEventListener('pointerup', handlePointerUp);
    dom.removeEventListener('pointercancel', handlePointerUp);
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('keydown', handleKeyDown);
    if (viewer.contains(dom)) {
      viewer.removeChild(dom);
    }
    state.renderer.dispose();
  }
  if (state.scene) {
    state.scene.clear();
  }
  state.scene = null;
  state.camera = null;
  state.controls = null;
  state.renderer = null;
  state.raycaster = null;
  state.pointer = null;
  state.floorPlane = null;
  state.hoverObject = null;
  state.objectGroup = null;
  state.gridGroup = null;
}

function makeGridLines(width, height, color) {
  const verts = [];
  // horizontal lines (constant z), one per row boundary
  for (let row = 0; row <= height; row++) {
    const z = row - 0.5;
    verts.push(-0.5, 0.001, z, width - 0.5, 0.001, z);
  }
  // vertical lines (constant x), one per column boundary
  for (let col = 0; col <= width; col++) {
    const x = col - 0.5;
    verts.push(x, 0.001, -0.5, x, 0.001, height - 0.5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
  return new THREE.LineSegments(geo, mat);
}

function makeScene() {
  destroyScene();

  const scene = new THREE.Scene();
  // Use theme background if available
  scene.background = new THREE.Color(state.themeColors && state.themeColors.background ? state.themeColors.background : 0x050816);
  state.scene = scene;

  const aspect = viewer.clientWidth / viewer.clientHeight;
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 500);
  camera.position.set(state.width * 0.9, Math.max(state.width, state.height) * 0.9, state.height * 1.2);
  camera.lookAt((state.width - 1) / 2, 0, (state.height - 1) / 2);
  state.camera = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  viewer.appendChild(renderer.domElement);
  state.renderer = renderer;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.9;
  controls.target.set((state.width - 1) / 2, 0, (state.height - 1) / 2);
  // Disable wheel zoom by default so page scroll works on desktop. Hold Ctrl/Cmd to zoom.
  controls.enableZoom = false;
  state.controls = controls;

  // Allow wheel to zoom only when Ctrl/Cmd or Meta is pressed (desktop): capture the event before OrbitControls
  renderer.domElement.addEventListener('wheel', (e) => {
    if (!state.controls) return;
    const mac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = mac ? e.metaKey : e.ctrlKey;
    if (modifier) {
      state.controls.enableZoom = true;
    } else {
      state.controls.enableZoom = false;
    }
    // Do not prevent default here; let the browser scroll when enableZoom is false
  }, { capture: true, passive: true });

  // Make sure touch-action doesn't block page scrolling on touch devices
  renderer.domElement.style.touchAction = 'auto';

  const ambientLight = new THREE.HemisphereLight(0x91e8ff, 0x101820, 0.7);
  scene.add(ambientLight);

  const rimLight = new THREE.DirectionalLight(0xe5f2ff, 0.6);
  rimLight.position.set(-6, 10, -4);
  scene.add(rimLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(12, 22, 18);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -30;
  keyLight.shadow.camera.right = 30;
  keyLight.shadow.camera.top = 30;
  keyLight.shadow.camera.bottom = -30;
  scene.add(keyLight);

  const groundMaterial = new THREE.MeshStandardMaterial({
    color: state.themeColors && state.themeColors.floor ? state.themeColors.floor : 0x111827,
    roughness: 0.92,
    metalness: 0.05,
    side: THREE.DoubleSide
  });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(state.width, state.height, state.width, state.height),
    groundMaterial
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((state.width - 1) / 2, 0, (state.height - 1) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  state.floorPlane = ground;

  const gridColor = (state.themeColors && state.themeColors.gridLine) ? state.themeColors.gridLine : 0x4f46e5;
  const gridLines = makeGridLines(state.width, state.height, gridColor);
  scene.add(gridLines);
  state.gridGroup = gridLines;

  const frameGeometry = new THREE.RingGeometry(state.width * 0.52, state.width * 0.55, 64);
  const frameMaterial = new THREE.MeshBasicMaterial({ color: state.themeColors && state.themeColors.frame ? state.themeColors.frame : 0x1e293b, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.rotation.x = -Math.PI / 2;
  frame.position.copy(ground.position);
  scene.add(frame);

  const perimeter = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(state.width, state.height)),
    new THREE.LineBasicMaterial({ color: state.themeColors && state.themeColors.gridEdge ? state.themeColors.gridEdge : 0x94a3b8, linewidth: 2, transparent: true, opacity: 0.6 })
  );
  perimeter.rotation.x = -Math.PI / 2;
  perimeter.position.copy(ground.position);
  scene.add(perimeter);

  state.objectGroup = new THREE.Group();
  scene.add(state.objectGroup);

  state.hoverObject = makeHoverObject();
  scene.add(state.hoverObject);

  state.raycaster = new THREE.Raycaster();
  state.pointer = new THREE.Vector2();

  state.renderer.domElement.addEventListener('pointermove', handlePointerMove);
  state.renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  state.renderer.domElement.addEventListener('pointerup', handlePointerUp);
  state.renderer.domElement.addEventListener('pointercancel', handlePointerUp);
  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('keydown', handleKeyDown);
}

function makeHoverObject() {
  const geometry = new THREE.PlaneGeometry(CELL_SIZE * 0.92, CELL_SIZE * 0.92);
  const hoverColor = (state.themeColors && state.themeColors.hover) ? state.themeColors.hover : 0x22d3ee;
  const material = new THREE.MeshStandardMaterial({
    color: hoverColor,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    emissive: hoverColor,
    emissiveIntensity: 0.6
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

function updateHoverGeometry(mode, orientation) {
  if (!state.hoverObject) return;
  const geometry = mode === 'edge'
    ? orientation === 'horizontal'
      ? new THREE.BoxGeometry(CELL_SIZE * 0.98, WALL_HEIGHT * 0.76, 0.26)
      : new THREE.BoxGeometry(0.26, WALL_HEIGHT * 0.76, CELL_SIZE * 0.98)
    : new THREE.PlaneGeometry(CELL_SIZE * 0.92, CELL_SIZE * 0.92);

  state.hoverObject.geometry.dispose();
  state.hoverObject.geometry = geometry;
  if (mode === 'edge') {
    state.hoverObject.rotation.set(0, orientation === 'vertical' ? Math.PI / 2 : 0, 0);
    state.hoverObject.position.y = WALL_HEIGHT / 2 - 0.1;
  } else {
    state.hoverObject.rotation.set(-Math.PI / 2, 0, 0);
    state.hoverObject.position.y = 0.03;
  }
}

function buildWallSegmentMesh(type, orientation) {
  const length = CELL_SIZE * 0.98;
  const thickness = 0.26;
  const geometry = orientation === 'horizontal'
    ? new THREE.BoxGeometry(length, WALL_HEIGHT * 0.82, thickness)
    : new THREE.BoxGeometry(thickness, WALL_HEIGHT * 0.82, length);
  const color = type === 'Door' ? (state.themeColors.door || 0xf97316) : (state.themeColors.wall || 0x6b7280);
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.2,
    roughness: 0.35,
    clearcoat: 0.1
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildObjectMesh(type) {
  let geometry;
  let material;

  switch (type) {
    case 'Door':
      geometry = new THREE.BoxGeometry(CELL_SIZE * 0.72, DOOR_HEIGHT, DOOR_WIDTH);
      material = new THREE.MeshPhysicalMaterial({ color: (state.themeColors.door || 0xf97316), metalness: 0.18, roughness: 0.28, clearcoat: 0.05 });
      break;
    case 'Walkway':
      geometry = new THREE.PlaneGeometry(CELL_SIZE * 0.96, CELL_SIZE * 0.96);
      material = new THREE.MeshPhysicalMaterial({
        color: (state.themeColors.walkway || 0x0ea5e9),
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        roughness: 0.75,
        metalness: 0.12,
        emissive: (state.themeColors.walkway || 0x0ea5e9),
        emissiveIntensity: 0.22
      });
      break;
    default:
      return null;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function refreshSceneObjects() {
  state.objectGroup.clear();

  for (let row = 0; row < state.height + 1; row += 1) {
    for (let col = 0; col < state.width; col += 1) {
      const type = state.horizontalWalls[row] && state.horizontalWalls[row][col];
      if (!type) continue;
      const mesh = buildWallSegmentMesh(type, 'horizontal');
      mesh.position.set(col, WALL_HEIGHT / 2 - 0.1, row - 0.5);
      state.objectGroup.add(mesh);
    }
  }

  for (let row = 0; row < state.height; row += 1) {
    for (let col = 0; col < state.width + 1; col += 1) {
      const type = state.verticalWalls[row] && state.verticalWalls[row][col];
      if (!type) continue;
      const mesh = buildWallSegmentMesh(type, 'vertical');
      mesh.position.set(col - 0.5, WALL_HEIGHT / 2 - 0.1, row);
      state.objectGroup.add(mesh);
    }
  }

  for (let row = 0; row < state.height; row += 1) {
    for (let col = 0; col < state.width; col += 1) {
      const cell = state.grid[row][col];
      if (!cell) continue;
      const mesh = buildObjectMesh(cell);
      if (!mesh) continue;
      mesh.position.set(col, cell === 'Walkway' ? 0.01 : DOOR_HEIGHT / 2 - 0.05, row);
      if (cell === 'Walkway') {
        mesh.rotation.x = -Math.PI / 2;
      }
      state.objectGroup.add(mesh);
    }
  }
}

function setActiveTool(tool) {
  state.activeTool = tool;
  activeToolLabel.textContent = tool;
  Array.from(paletteEl.children).forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });
  setHoverObjectType(tool);
}

function setHoverObjectType(tool) {
  if (state.hoverObject && state.scene) {
    state.scene.remove(state.hoverObject);
  }
  state.hoverObject = makeHoverObject();
  if (state.scene) {
    state.scene.add(state.hoverObject);
  }
  updateHoverStyle();
}

function buildPalette() {
  paletteEl.innerHTML = '';
  TOOL_TYPES.forEach((tool) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tool.label;
    button.dataset.tool = tool.key;
    button.addEventListener('click', () => setActiveTool(tool.key));
    paletteEl.appendChild(button);
  });
  setActiveTool(state.activeTool);
}

function updateHoverStyle() {
  if (!state.hoverObject) return;
  const theme = state.themeColors || {};
  const color = state.activeTool === 'Erase'
    ? (theme.door || 0xf97316)
    : state.activeTool === 'Door'
      ? (theme.door || 0xf97316)
      : state.activeTool === 'Wall'
        ? (theme.wall || 0x8b5cf6)
        : state.activeTool === 'Walkway'
          ? (theme.walkway || 0x0ea5e9)
          : (theme.hover || 0x22d3ee);
  if (state.hoverObject && state.hoverObject.material) {
    state.hoverObject.material.color.setHex(color);
    state.hoverObject.material.emissive.setHex(color);

    // If user locked preferred orientation, slightly tint the hover for clarity
    if (state.preferredOrientation) {
      state.hoverObject.material.emissiveIntensity = 0.9;
    } else {
      state.hoverObject.material.emissiveIntensity = 0.6;
    }
  }
}

function updateRotationIndicator() {
  const el = document.getElementById('orient-val');
  if (!el) return;
  el.textContent = state.preferredOrientation ? (state.preferredOrientation === 'horizontal' ? 'Horizontal' : 'Vertical') : 'Any';
}

function handleWindowResize() {
  if (!state.camera || !state.renderer) return;
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height);
}

function findNearestGridEdge(point) {
  const x = clamp(point.x, 0, state.width);
  const z = clamp(point.z, 0, state.height);
  const xRound = Math.round(x);
  const zRound = Math.round(z);
  const dx = Math.abs(x - xRound);
  const dz = Math.abs(z - zRound);
  const threshold = 0.35;
  let orientation = null;
  let row = null;
  let col = null;

  if (dz < dx && dz < threshold) {
    orientation = 'horizontal';
    row = zRound;
    col = clamp(Math.floor(x), 0, state.width - 1);
  } else if (dx < threshold) {
    orientation = 'vertical';
    col = xRound;
    row = clamp(Math.floor(z), 0, state.height - 1);
  } else {
    return null;
  }

  // Respect a user preference lock (press R to toggle)
  if (state.preferredOrientation && orientation !== state.preferredOrientation) return null;

  return { orientation, row, col };
}

let pointerDown = false;
let startEdge = null;

function handlePointerMove(event) {
  if (!state.raycaster || !state.camera) return;
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);

  const intersects = state.raycaster.intersectObject(state.floorPlane);
  if (!intersects.length) {
    state.hoverObject.visible = false;
    state.hoveredCell = null;
    state.hoveredEdge = null;
    return;
  }

  const point = intersects[0].point;
  const hoverEdge = findNearestGridEdge(point);
  const x = clamp(Math.floor(point.x + 0.5), 0, state.width - 1);
  const z = clamp(Math.floor(point.z + 0.5), 0, state.height - 1);
  state.hoveredCell = { x, z };
  state.hoveredEdge = hoverEdge;

  const canEdgeHover = state.activeTool === 'Wall' || state.activeTool === 'Door' || state.activeTool === 'Erase';
  if (canEdgeHover && hoverEdge) {
    updateHoverGeometry('edge', hoverEdge.orientation);
    const { orientation, row, col } = hoverEdge;
    const posX = orientation === 'horizontal' ? col : col - 0.5;
    const posZ = orientation === 'vertical' ? row : row - 0.5;
    state.hoverObject.position.set(posX, WALL_HEIGHT / 2 - 0.1, posZ);
    state.hoverObject.visible = true;

    // If dragging, apply continuous placement
    if (pointerDown && (state.activeTool === 'Wall' || state.activeTool === 'Door' || state.activeTool === 'Erase')) {
      if (event.shiftKey && startEdge && startEdge.orientation === hoverEdge.orientation) {
        // draw straight line between startEdge and current hoverEdge along same orientation
        drawEdgeLine(startEdge, hoverEdge);
      } else {
        applyEdgeAt(hoverEdge);
      }
      refreshSceneObjects();
      updateOutput();
    }
  } else if (state.activeTool === 'Walkway' || state.activeTool === 'Erase') {
    updateHoverGeometry('cell');
    state.hoverObject.position.set(x, 0.04, z);
    state.hoverObject.visible = true;

    if (pointerDown && state.activeTool === 'Walkway') {
      // paint walkways while dragging
      state.grid[z][x] = 'Walkway';
      refreshSceneObjects();
      updateOutput();
    }
  } else {
    state.hoverObject.visible = false;
  }
}

function applyEdgeAt(hoverEdge) {
  const { orientation, row, col } = hoverEdge;
  const target = orientation === 'horizontal' ? state.horizontalWalls[row] : state.verticalWalls[row];
  if (!target) return;
  if (state.activeTool === 'Erase') {
    target[col] = null;
  } else if (state.activeTool === 'Door') {
    target[col] = 'Door';
  } else if (state.activeTool === 'Wall') {
    target[col] = 'Wall';
  }
}

function drawEdgeLine(a, b) {
  if (!a || !b) return;
  if (a.orientation !== b.orientation) return;
  const orientation = a.orientation;
  if (orientation === 'horizontal') {
    if (a.row !== b.row) return; // must be same row
    const row = a.row;
    const c0 = Math.min(a.col, b.col);
    const c1 = Math.max(a.col, b.col);
    for (let c = c0; c <= c1; c++) {
      const target = state.horizontalWalls[row];
      if (!target) continue;
      if (state.activeTool === 'Erase') target[c] = null;
      else if (state.activeTool === 'Door') target[c] = 'Door';
      else target[c] = 'Wall';
    }
  } else {
    // vertical
    if (a.col !== b.col) return; // must be same col
    const col = a.col;
    const r0 = Math.min(a.row, b.row);
    const r1 = Math.max(a.row, b.row);
    for (let r = r0; r <= r1; r++) {
      const target = state.verticalWalls[r];
      if (!target) continue;
      if (state.activeTool === 'Erase') target[col] = null;
      else if (state.activeTool === 'Door') target[col] = 'Door';
      else target[col] = 'Wall';
    }
  }
}

function handlePointerDown(event) {
  if (!event.isPrimary) return;
  if (event.button !== 0) return; // left-click only — right-click is orbit pan

  pointerDown = true;
  // record start edge for shift-straight drawing
  startEdge = state.hoveredEdge ? { ...state.hoveredEdge } : null;

  // push history BEFORE modifying so undo returns to previous state
  pushHistory();

  if ((state.activeTool === 'Wall' || state.activeTool === 'Door' || state.activeTool === 'Erase') && state.hoveredEdge) {
    applyEdgeAt(state.hoveredEdge);
  } else if (state.hoveredCell) {
    const { x, z } = state.hoveredCell;
    if (state.activeTool === 'Erase') {
      state.grid[z][x] = null;
    } else if (state.activeTool === 'Walkway') {
      state.grid[z][x] = 'Walkway';
    }
  }

  refreshSceneObjects();
  updateOutput();
}

function handlePointerUp(event) {
  pointerDown = false;
  startEdge = null;
}

function renderAscii() {
  const rows = state.height * 2 + 1;
  const cols = state.width * 2 + 1;
  const asciiGrid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ' '));

  for (let y = 0; y < rows; y += 2) {
    for (let x = 0; x < cols; x += 2) {
      asciiGrid[y][x] = '+';
    }
  }

  for (let row = 0; row < state.height + 1; row += 1) {
    for (let col = 0; col < state.width; col += 1) {
      const type = state.horizontalWalls[row] && state.horizontalWalls[row][col];
      if (!type) continue;
      const asciiRow = row * 2;
      const asciiCol = col * 2 + 1;
      asciiGrid[asciiRow][asciiCol] = type === 'Door' ? 'D' : '-';
    }
  }

  for (let row = 0; row < state.height; row += 1) {
    for (let col = 0; col < state.width + 1; col += 1) {
      const type = state.verticalWalls[row] && state.verticalWalls[row][col];
      if (!type) continue;
      const asciiRow = row * 2 + 1;
      const asciiCol = col * 2;
      asciiGrid[asciiRow][asciiCol] = type === 'Door' ? 'D' : '|';
    }
  }

  for (let row = 0; row < state.height; row += 1) {
    for (let col = 0; col < state.width; col += 1) {
      const cell = state.grid[row][col];
      const asciiRow = row * 2 + 1;
      const asciiCol = col * 2 + 1;
      asciiGrid[asciiRow][asciiCol] = cell === 'Walkway' ? '.' : ' ';
    }
  }

  return asciiGrid.map((row) => row.join('')).join('\n');
}

function countWallAndDoorEdges() {
  let walls = 0;
  let doors = 0;
  for (let row = 0; row < state.height + 1; row += 1) {
    for (let col = 0; col < state.width; col += 1) {
      const type = state.horizontalWalls[row] && state.horizontalWalls[row][col];
      if (type === 'Wall') walls += 1;
      if (type === 'Door') doors += 1;
    }
  }
  for (let row = 0; row < state.height; row += 1) {
    for (let col = 0; col < state.width + 1; col += 1) {
      const type = state.verticalWalls[row] && state.verticalWalls[row][col];
      if (type === 'Wall') walls += 1;
      if (type === 'Door') doors += 1;
    }
  }
  return { walls, doors };
}

function computeCostSummary() {
  const { walls, doors } = countWallAndDoorEdges();
  const walkway = state.grid.flat().filter((cell) => cell === 'Walkway').length;
  const lines = [];
  if (walls) lines.push(['Walls', walls, DEFAULT_CATALOG.Wall.unit_cost, walls * DEFAULT_CATALOG.Wall.unit_cost]);
  if (doors) lines.push(['Doors', doors, DEFAULT_CATALOG.Door.unit_cost, doors * DEFAULT_CATALOG.Door.unit_cost]);
  if (walkway) lines.push(['Walkways', walkway, DEFAULT_CATALOG.Walkway.unit_cost, walkway * DEFAULT_CATALOG.Walkway.unit_cost]);
  return { counts: { Wall: walls, Door: doors, Walkway: walkway }, lines };
}

function updateOutput() {
  asciiOutput.textContent = renderAscii();
  const { counts, lines } = computeCostSummary();
  objectCountLabel.textContent = counts.Wall + counts.Door + counts.Walkway;
  totalCostLabel.textContent = `$${lines.reduce((sum, [, , , subtotal]) => sum + subtotal, 0).toFixed(2)}`;
  walkwayCountLabel.textContent = counts.Walkway;
  doorCountLabel.textContent = counts.Door;

  if (!lines.length) {
    billOutput.innerHTML = '<p class="bill-empty">No objects placed yet. Click on the grid to build walls, doors, or walkways.</p>';
    return;
  }

  const rows = lines
    .map(
      ([name, count, cost, subtotal]) =>
        `<tr><td>${name}</td><td>${count}</td><td>$${cost.toFixed(2)}</td><td>$${subtotal.toFixed(2)}</td></tr>`
    )
    .join('');

  const total = lines.reduce((sum, [, , , subtotal]) => sum + subtotal, 0);
  billOutput.innerHTML = `
    <table>
      <thead><tr><th>Item</th><th>Units</th><th>Unit</th><th>Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th colspan="3">Total</th><th>$${total.toFixed(2)}</th></tr></tfoot>
    </table>`;
}

function placePerimeterWalls() {
  for (let col = 0; col < state.width; col += 1) {
    state.horizontalWalls[0][col] = 'Wall';
    state.horizontalWalls[state.height][col] = 'Wall';
  }
  for (let row = 0; row < state.height; row += 1) {
    state.verticalWalls[row][0] = 'Wall';
    state.verticalWalls[row][state.width] = 'Wall';
  }
}

function placeDoors() {
  const doorCount = clamp(parseInt(doorCountInput.value, 10) || 2, 1, Math.max(1, Math.floor((state.width + state.height) / 4)));
  const positions = [];

  for (let col = 1; col < state.width - 1; col += 1) {
    positions.push({ orientation: 'horizontal', row: 0, col });
    positions.push({ orientation: 'horizontal', row: state.height, col });
  }
  for (let row = 1; row < state.height - 1; row += 1) {
    positions.push({ orientation: 'vertical', row, col: 0 });
    positions.push({ orientation: 'vertical', row, col: state.width });
  }

  const step = Math.max(1, Math.floor(positions.length / doorCount));
  for (let i = 0; i < doorCount; i += 1) {
    const index = (i * step + Math.floor(step / 2)) % positions.length;
    const pos = positions[index];
    if (pos.orientation === 'horizontal') {
      state.horizontalWalls[pos.row][pos.col] = 'Door';
    } else {
      state.verticalWalls[pos.row][pos.col] = 'Door';
    }
  }
}

function placeWalkways() {
  const walkwayWidth = clamp(parseInt(walkwayInput.value, 10) || 1, 1, Math.max(1, state.height - 3));
  for (let row = 1; row < state.height - 1; row += walkwayWidth + 1) {
    for (let col = 1; col < state.width - 1; col += 1) {
      state.grid[row][col] = 'Walkway';
    }
  }
}

// --- History / Save / Load helpers ---
const HISTORY_LIMIT = 80;
const history = { past: [], future: [] };

function snapshotState() {
  return JSON.stringify({
    width: state.width,
    height: state.height,
    grid: state.grid,
    horizontalWalls: state.horizontalWalls,
    verticalWalls: state.verticalWalls
  });
}

function pushHistory() {
  try {
    const snap = snapshotState();
    history.past.push(snap);
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future = [];
    updateUndoRedoButtons();
  } catch (e) {
    // ignore
  }
}

function undo() {
  if (!history.past.length) return;
  const last = history.past.pop();
  history.future.push(snapshotState());
  applySnapshot(last);
  updateUndoRedoButtons();
}

function redo() {
  if (!history.future.length) return;
  const next = history.future.pop();
  history.past.push(snapshotState());
  applySnapshot(next);
  updateUndoRedoButtons();
}

function applySnapshot(serialized) {
  try {
    const obj = JSON.parse(serialized);
    state.width = obj.width;
    state.height = obj.height;
    state.grid = obj.grid.map((r) => r.slice());
    state.horizontalWalls = obj.horizontalWalls.map((r) => r.slice());
    state.verticalWalls = obj.verticalWalls.map((r) => r.slice());
    updateLabels();
    makeScene();
    refreshSceneObjects();
    updateOutput();
  } catch (e) {
    console.error('Failed to apply snapshot', e);
  }
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  if (undoBtn) undoBtn.disabled = history.past.length === 0;
  if (redoBtn) redoBtn.disabled = history.future.length === 0;
}

function saveToLocal() {
  const key = 'vhg.save';
  const data = snapshotState();
  localStorage.setItem(key, data);
  alert('Design saved locally');
}

function loadFromLocal() {
  const key = 'vhg.save';
  const raw = localStorage.getItem(key);
  if (!raw) { alert('No saved design found in localStorage.'); return; }
  pushHistory();
  applySnapshot(raw);
}

function exportToFile() {
  const filename = `layout-${Date.now()}.json`;
  const blob = new Blob([snapshotState()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Save to named slot (0..4) with optional snapshot thumbnail
function saveToSlot(slotIndex) {
  try {
    const dataKey = `vhg.slot.${slotIndex}`;
    const snap = snapshotState();
    localStorage.setItem(dataKey, snap);
    // capture PNG preview if renderer available
    if (state.renderer && state.renderer.domElement) {
      try {
        const url = state.renderer.domElement.toDataURL('image/png');
        localStorage.setItem(`${dataKey}.preview`, url);
      } catch (e) {
        // ignore
      }
    }
    alert(`Saved to slot ${slotIndex + 1}`);
    updateSlotPreviews();
  } catch (e) {
    alert('Failed to save to slot');
  }
}

function deleteSlot(slotIndex) {
  const dataKey = `vhg.slot.${slotIndex}`;
  localStorage.removeItem(dataKey);
  localStorage.removeItem(`${dataKey}.preview`);
  alert(`Deleted slot ${slotIndex + 1}`);
  updateSlotPreviews();
}

function loadFromSlot(slotIndex) {
  const dataKey = `vhg.slot.${slotIndex}`;
  const raw = localStorage.getItem(dataKey);
  if (!raw) { alert('No data in that slot'); return; }
  pushHistory();
  applySnapshot(raw);
}

function updateSlotPreviews() {
  const sel = document.getElementById('save-slot-select');
  if (!sel) return;
  for (let i = 0; i < sel.options.length; i++) {
    const key = `vhg.slot.${i}.preview`;
    const p = localStorage.getItem(key);
    const opt = sel.options[i];
    if (p) {
      opt.textContent = `Slot ${i + 1} (saved)`;
    } else {
      opt.textContent = `Slot ${i + 1}`;
    }
  }
}

function openSaveManager() {
  const modal = document.getElementById('save-manager-modal');
  const grid = document.getElementById('save-manager-grid');
  if (!modal || !grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const key = `vhg.slot.${i}`;
    const raw = localStorage.getItem(key);
    const preview = localStorage.getItem(`${key}.preview`);
    const item = document.createElement('div');
    item.className = 'save-manager-item';
    const img = document.createElement('img');
    img.className = 'save-manager-thumb';
    img.alt = `Slot ${i + 1}`;
    if (preview) img.src = preview;
    else img.src = '';
    const meta = document.createElement('div');
    meta.className = 'save-manager-meta';
    meta.textContent = raw ? `Slot ${i + 1} — saved` : `Slot ${i + 1} — empty`;
    const actions = document.createElement('div');
    actions.className = 'save-manager-actions';
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      if (raw) {
        pushHistory();
        applySnapshot(raw);
        modal.style.display = 'none';
      } else {
        alert('Slot empty');
      }
    });
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'secondary';
    delBtn.addEventListener('click', () => {
      if (confirm(`Delete slot ${i + 1}?`)) {
        deleteSlot(i);
        openSaveManager();
      }
    });
    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);

    item.appendChild(img);
    item.appendChild(meta);
    item.appendChild(actions);
    grid.appendChild(item);
  }

  const close = document.getElementById('save-manager-close');
  close.onclick = () => { modal.style.display = 'none'; };
  modal.style.display = 'flex';
}

function exportPNG() {
  if (!state.renderer || !state.renderer.domElement) { alert('No renderer available'); return; }
  try {
    const url = state.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `layout-${Date.now()}.png`;
    a.click();
  } catch (e) {
    alert('Failed to export PNG');
  }
}

function importFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const txt = reader.result;
      JSON.parse(txt); // validate
      pushHistory();
      applySnapshot(txt);
    } catch (e) {
      alert('Invalid JSON file');
    }
  };
  reader.readAsText(file);
}

function applyAutoBuild() {
  pushHistory();
  state.grid = createGridArray(state.width, state.height);
  const walls = createWallArrays(state.width, state.height);
  state.horizontalWalls = walls.horizontalWalls;
  state.verticalWalls = walls.verticalWalls;
  placePerimeterWalls();
  placeDoors();
  placeWalkways();
  refreshSceneObjects();
  updateOutput();
}

function applyCustomDesign() {
  state.grid = createGridArray(state.width, state.height);
  const walls = createWallArrays(state.width, state.height);
  state.horizontalWalls = walls.horizontalWalls;
  state.verticalWalls = walls.verticalWalls;
  placePerimeterWalls();

  const centerX = Math.floor(state.width / 2);
  const centerY = Math.floor(state.height / 2);
  const pattern = Math.floor(Math.random() * 3);

  if (pattern === 0) {
    for (let col = 2; col < state.width - 2; col += 2) {
      state.horizontalWalls[centerY][col] = 'Wall';
    }
    for (let row = 2; row < state.height - 2; row += 2) {
      state.verticalWalls[row][centerX] = 'Wall';
    }
  } else if (pattern === 1) {
    for (let row = 2; row < state.height - 2; row += 3) {
      for (let col = 2; col < state.width - 2; col += 1) {
        state.horizontalWalls[row][col] = 'Wall';
      }
    }
    for (let col = 2; col < state.width - 2; col += 3) {
      for (let row = 2; row < state.height - 2; row += 1) {
        state.verticalWalls[row][col] = 'Wall';
      }
    }
  } else {
    for (let offset = 1; offset <= Math.min(centerX, centerY); offset += 2) {
      state.horizontalWalls[centerY - offset][centerX - offset] = 'Wall';
      state.horizontalWalls[centerY + offset][centerX + offset] = 'Wall';
      state.verticalWalls[centerY - offset][centerX - offset] = 'Wall';
      state.verticalWalls[centerY + offset][centerX + offset] = 'Wall';
    }
    for (let row = 1; row < state.height - 1; row += 2) {
      state.verticalWalls[row][1] = 'Wall';
      state.verticalWalls[row][state.width - 1] = 'Wall';
    }
  }

  placeDoors();
  fillWalkways();
  refreshSceneObjects();
  updateOutput();
}

// Keyboard handling: R toggles preferred orientation
function handleKeyDown(e) {
  // Ctrl/Cmd + Z / Y for undo/redo
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const meta = isMac ? e.metaKey : e.ctrlKey;
  if (meta && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    undo();
    return;
  }
  if (meta && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    redo();
    return;
  }

  if (e.key && e.key.toLowerCase() === 'r') {
    if (!state.preferredOrientation) state.preferredOrientation = 'horizontal';
    else if (state.preferredOrientation === 'horizontal') state.preferredOrientation = 'vertical';
    else state.preferredOrientation = null;
    updateRotationIndicator();
    updateHoverStyle();
    return;
  }
}

function fillWalkways() {
  for (let row = 1; row < state.height - 1; row += 1) {
    for (let col = 1; col < state.width - 1; col += 1) {
      if (!state.grid[row][col]) {
        state.grid[row][col] = 'Walkway';
      }
    }
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function showSetupModal() {
  const modal = document.getElementById('setup-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  const cancel = document.getElementById('modal-cancel');
  const start = document.getElementById('modal-start');
  const modalWidth = document.getElementById('modal-width');
  const modalHeight = document.getElementById('modal-height');
  const modalWalk = document.getElementById('modal-walkway');
  const modalDoors = document.getElementById('modal-doors');

  const focusable = Array.from(modal.querySelectorAll('input,button,select,a[href]')).filter((el) => !el.hasAttribute('disabled'));
  let focusIndex = 0;
  function modalKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      focusIndex = (focusIndex + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[focusIndex].focus();
    }
    if (e.key === 'Escape') {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', modalKeyDown);
    }
  }

  cancel.onclick = () => { modal.style.display = 'none'; document.body.classList.remove('modal-open'); window.removeEventListener('keydown', modalKeyDown); };
  start.onclick = () => {
    const w = clamp(parseInt(modalWidth.value, 10) || 12, 6, 48);
    const h = clamp(parseInt(modalHeight.value, 10) || 18, 6, 48);
    widthInput.value = String(w);
    heightInput.value = String(h);
    walkwayInput.value = String(clamp(parseInt(modalWalk.value, 10) || 1, 1, 8));
    doorCountInput.value = String(clamp(parseInt(modalDoors.value, 10) || 2, 1, 6));
    state.width = w;
    state.height = h;
    state.grid = createGridArray(state.width, state.height);
    const wallsArr = createWallArrays(state.width, state.height);
    state.horizontalWalls = wallsArr.horizontalWalls;
    state.verticalWalls = wallsArr.verticalWalls;
    updateLabels();
    makeScene();
    refreshSceneObjects();
    updateOutput();
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    window.removeEventListener('keydown', modalKeyDown);
  };

  // focus management
  window.addEventListener('keydown', modalKeyDown);
  modal.style.display = 'flex';
  setTimeout(() => {
    if (focusable.length) {
      focusable[0].focus();
      focusIndex = 0;
    }
  }, 50);
}

function init() {
  state.grid = createGridArray(state.width, state.height);
  const walls = createWallArrays(state.width, state.height);
  state.horizontalWalls = walls.horizontalWalls;
  state.verticalWalls = walls.verticalWalls;
  buildPalette();
  makeScene();
  updateLabels();
  updateOutput();
  animate();
  // show the modal on load to collect settings before building
  showSetupModal();
  updateRotationIndicator();
}

function animate() {
  requestAnimationFrame(animate);
  if (state.controls) {
    state.controls.update();
  }
  if (state.renderer && state.camera && state.scene) {
    state.renderer.render(state.scene, state.camera);
  }
}

resizeBtn.addEventListener('click', () => {
  state.width = clamp(parseInt(widthInput.value, 10) || 12, 6, 48);
  state.height = clamp(parseInt(heightInput.value, 10) || 18, 6, 48);
  state.grid = createGridArray(state.width, state.height);
  const walls = createWallArrays(state.width, state.height);
  state.horizontalWalls = walls.horizontalWalls;
  state.verticalWalls = walls.verticalWalls;
  updateLabels();
  makeScene();
  refreshSceneObjects();
  updateOutput();
});

autoBuildBtn.addEventListener('click', applyAutoBuild);
customBtn.addEventListener('click', () => { pushHistory(); applyCustomDesign(); });

// Undo / redo / save / load / export / import / lock UI hooks
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const saveBtn = document.getElementById('save-btn');
const loadBtn = document.getElementById('load-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const lockBtn = document.getElementById('lock-btn');
const saveSlotSelect = document.getElementById('save-slot-select');
const saveSlotSave = document.getElementById('save-slot-save');
const saveSlotDelete = document.getElementById('save-slot-delete');

if (undoBtn) undoBtn.addEventListener('click', undo);
if (redoBtn) redoBtn.addEventListener('click', redo);
if (saveBtn) saveBtn.addEventListener('click', saveToLocal);
if (loadBtn) loadBtn.addEventListener('click', loadFromLocal);
if (exportBtn) exportBtn.addEventListener('click', exportToFile);
if (importBtn) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importFromFile(f);
    fileInput.value = '';
  });
  importBtn.addEventListener('click', () => fileInput.click());
  document.body.appendChild(fileInput);
}

if (saveSlotSelect && saveSlotSave && saveSlotDelete) {
  saveSlotSave.addEventListener('click', () => {
    const idx = parseInt(saveSlotSelect.value, 10) || 0;
    saveToSlot(idx);
  });
  saveSlotDelete.addEventListener('click', () => {
    const idx = parseInt(saveSlotSelect.value, 10) || 0;
    if (confirm(`Delete saved slot ${idx + 1}?`)) deleteSlot(idx);
  });
  updateSlotPreviews();

  const manageBtn = document.getElementById('manage-saves-btn');
  if (manageBtn) manageBtn.addEventListener('click', openSaveManager);
}

// Export PNG button
const exportPngBtn = document.getElementById('export-png-btn');
if (exportPngBtn) exportPngBtn.addEventListener('click', exportPNG);

if (lockBtn) lockBtn.addEventListener('click', () => {
  if (!state.preferredOrientation) state.preferredOrientation = 'horizontal';
  else if (state.preferredOrientation === 'horizontal') state.preferredOrientation = 'vertical';
  else state.preferredOrientation = null;
  updateRotationIndicator();
  updateHoverStyle();
});

resetBtn.addEventListener('click', () => {
  widthInput.value = '12';
  heightInput.value = '18';
  walkwayInput.value = '1';
  doorCountInput.value = '2';
  state.width = 12;
  state.height = 18;
  state.grid = createGridArray(state.width, state.height);
  const walls = createWallArrays(state.width, state.height);
  state.horizontalWalls = walls.horizontalWalls;
  state.verticalWalls = walls.verticalWalls;
  updateLabels();
  makeScene();
  refreshSceneObjects();
  updateOutput();
});

// Sidebar toggle: persist collapsed state
function setSidebarCollapsed(collapsed) {
  if (!sidebarEl) return;
  sidebarEl.classList.toggle('collapsed', !!collapsed);
  try { localStorage.setItem('vhg.sidebarCollapsed', collapsed ? '1' : '0'); } catch (e) { }
}
if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', () => {
    const willCollapse = !sidebarEl.classList.contains('collapsed');
    setSidebarCollapsed(willCollapse);
  });
}
// restore preference on load
try {
  const collapsedPref = localStorage.getItem('vhg.sidebarCollapsed');
  if (collapsedPref === '1') setSidebarCollapsed(true);
} catch (e) { }

// Theme selector wiring: applies data-theme to documentElement and persists
const themeSelect = document.getElementById('theme-select');
const themeSwatches = Array.from(document.querySelectorAll('.theme-swatch'));
function setActiveSwatch(theme) {
  themeSwatches.forEach(s => s.classList.toggle('active', s.dataset.theme === theme));
}
function applyTheme(theme) {
  try {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('vhg.theme', theme || '');
  } catch (e) { /* ignore */ }
  // update theme colors and apply to any active scene
  try {
    updateThemeColors();
    applyThemeToSceneIfReady();
  } catch (e) { /* ignore */ }
  setActiveSwatch(theme);
  if (themeSelect) themeSelect.value = theme || '';
}
if (themeSelect) {
  themeSelect.addEventListener('change', (ev) => applyTheme(ev.target.value));
}
// swatches click handlers
themeSwatches.forEach((s) => {
  s.addEventListener('click', () => applyTheme(s.dataset.theme));
});
// restore theme preference
try {
  const themePref = localStorage.getItem('vhg.theme');
  if (themePref) {
    applyTheme(themePref);
  } else {
    // no preference — choose business by default
    applyTheme('business');
  }
} catch (e) { }

// ensure initial theme colors before creating the scene
try { updateThemeColors(); } catch (e) { }
init();
