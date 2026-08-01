import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.154.0/examples/jsm/controls/OrbitControls.js';

const CELL_SIZE = 1;
const WALL_HEIGHT = 2.4;
const SHELF_HEIGHT = 0.32;
const DOOR_HEIGHT = 1.9;
const DOOR_WIDTH = 0.48;
const FLOOR_COLOR = 0x111827;
const GRID_LINE_COLOR = 0x4f46e5;
const GRID_EDGE_COLOR = 0x475569;
const HOVER_COLOR = 0x22d3ee;

const DEFAULT_CATALOG = {
  Wall: { unit_cost: 5 },
  Shelf: { unit_cost: 10, thickness: 1 },
  Walkway: { unit_cost: 0 },
  Door: { unit_cost: 50 }
};

const TOOL_TYPES = [
  { key: 'Wall', label: 'Wall' },
  { key: 'Shelf', label: 'Shelf' },
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
const resetBtn = document.getElementById('reset-btn');
const asciiOutput = document.getElementById('ascii-output');
const billOutput = document.getElementById('bill-output');
const objectCountLabel = document.getElementById('object-count-label');
const totalCostLabel = document.getElementById('total-cost-label');
const walkwayCountLabel = document.getElementById('walkway-count-label');
const shelfCountLabel = document.getElementById('shelf-count-label');
const viewer = document.getElementById('viewer');

const state = {
  width: 12,
  height: 18,
  activeTool: 'Wall',
  grid: [],
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  raycaster: null,
  pointer: null,
  floorPlane: null,
  hoverObject: null,
  hoveredCell: null,
  objectGroup: null,
  gridGroup: null
};

function createGridArray(width, height) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
}

function updateLabels() {
  gridSizeLabel.textContent = `${state.width} × ${state.height}`;
}

function destroyScene() {
  if (state.renderer) {
    const dom = state.renderer.domElement;
    dom.removeEventListener('pointermove', handlePointerMove);
    dom.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('resize', handleWindowResize);
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

function makeScene() {
  destroyScene();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050816);
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
  state.controls = controls;

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
    color: FLOOR_COLOR,
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

  const grid = new THREE.GridHelper(state.width, state.width, GRID_LINE_COLOR, GRID_EDGE_COLOR);
  grid.position.set((state.width - 1) / 2, 0.001, (state.height - 1) / 2);
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);
  state.gridGroup = grid;

  const frameGeometry = new THREE.RingGeometry(state.width * 0.52, state.width * 0.55, 64);
  const frameMaterial = new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.rotation.x = -Math.PI / 2;
  frame.position.copy(ground.position);
  scene.add(frame);

  const perimeter = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(state.width, state.height)),
    new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 2, transparent: true, opacity: 0.6 })
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
  window.addEventListener('resize', handleWindowResize);
}

function makeHoverObject() {
  const mesh = buildPreviewMesh(state.activeTool);
  if (!mesh) {
    return new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE * 0.92, CELL_SIZE * 0.92), new THREE.MeshBasicMaterial({ visible: false }));
  }
  mesh.material = mesh.material.clone();
  mesh.material.transparent = true;
  mesh.material.opacity = 0.24;
  if (mesh.material.emissive) {
    mesh.material.emissiveIntensity = 0.65;
  }
  mesh.userData.hover = true;
  mesh.visible = false;
  return mesh;
}

function buildPreviewMesh(type) {
  const mesh = buildObjectMesh(type);
  if (!mesh) return null;
  if (type === 'Walkway') {
    mesh.rotation.x = -Math.PI / 2;
  }
  return mesh;
}

function buildObjectMesh(type) {
  let geometry;
  let material;

  switch (type) {
    case 'Wall':
      geometry = new THREE.BoxGeometry(CELL_SIZE * 0.9, WALL_HEIGHT, CELL_SIZE * 0.25);
      material = new THREE.MeshPhysicalMaterial({ color: 0x6b7280, metalness: 0.2, roughness: 0.35, clearcoat: 0.16 });
      break;
    case 'Shelf':
      geometry = new THREE.BoxGeometry(CELL_SIZE * 0.9, SHELF_HEIGHT, CELL_SIZE * 0.9);
      material = new THREE.MeshPhysicalMaterial({ color: 0x8b5cf6, metalness: 0.12, roughness: 0.38, clearcoat: 0.1 });
      break;
    case 'Door':
      geometry = new THREE.BoxGeometry(CELL_SIZE * 0.72, DOOR_HEIGHT, DOOR_WIDTH);
      material = new THREE.MeshPhysicalMaterial({ color: 0xf97316, metalness: 0.18, roughness: 0.28, clearcoat: 0.05 });
      break;
    case 'Walkway':
      geometry = new THREE.PlaneGeometry(CELL_SIZE * 0.96, CELL_SIZE * 0.96);
      material = new THREE.MeshPhysicalMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        roughness: 0.75,
        metalness: 0.12,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.22
      });
      break;
    default:
      return null;
  }

  const mesh = new THREE.Mesh(geometry, material);
  if (type !== 'Walkway') {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return mesh;
}

function refreshSceneObjects() {
  state.objectGroup.clear();
  for (let row = 0; row < state.height; row += 1) {
    for (let col = 0; col < state.width; col += 1) {
      const cell = state.grid[row][col];
      if (!cell) continue;
      const mesh = buildObjectMesh(cell);
      if (!mesh) continue;
      mesh.position.set(col, cell === 'Walkway' ? 0.01 : cell === 'Shelf' ? SHELF_HEIGHT / 2 : DOOR_HEIGHT / 2 - 0.05, row);
      if (cell === 'Wall') {
        mesh.position.y = WALL_HEIGHT / 2 - 0.1;
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
  const color = state.activeTool === 'Erase' ? 0xf97316 : state.activeTool === 'Door' ? 0xf97316 : state.activeTool === 'Shelf' ? 0x8b5cf6 : state.activeTool === 'Walkway' ? 0x0ea5e9 : 0x22d3ee;
  state.hoverObject.material.color.set(color);
  state.hoverObject.material.emissive.set(color);
}

function handleWindowResize() {
  if (!state.camera || !state.renderer) return;
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height);
}

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
    return;
  }

  const point = intersects[0].point;
  const x = clamp(Math.floor(point.x + 0.5), 0, state.width - 1);
  const z = clamp(Math.floor(point.z + 0.5), 0, state.height - 1);
  state.hoveredCell = { x, z };
  state.hoverObject.position.set(x, 0.04, z);
  state.hoverObject.visible = true;
}

function handlePointerDown(event) {
  if (!event.isPrimary || !state.hoveredCell) return;
  const { x, z } = state.hoveredCell;
  if (state.activeTool === 'Erase') {
    state.grid[z][x] = null;
  } else {
    state.grid[z][x] = state.activeTool;
  }
  refreshSceneObjects();
  updateOutput();
}

function renderAscii() {
  return state.grid
    .map((row) =>
      row
        .map((cell) => {
          if (!cell) return '.';
          if (cell === 'Wall') return 'W';
          if (cell === 'Shelf') return 'S';
          if (cell === 'Door') return 'D';
          if (cell === 'Walkway') return '.';
          return '.';
        })
        .join('')
    )
    .join('\n');
}

function computeCostSummary() {
  const counts = { Wall: 0, Shelf: 0, Door: 0, Walkway: 0 };
  state.grid.flat().forEach((cell) => {
    if (cell && counts[cell] !== undefined) counts[cell] += 1;
  });
  const lines = [];
  if (counts.Wall) lines.push(['Walls', counts.Wall, DEFAULT_CATALOG.Wall.unit_cost, counts.Wall * DEFAULT_CATALOG.Wall.unit_cost]);
  if (counts.Shelf) lines.push(['Shelves', counts.Shelf, DEFAULT_CATALOG.Shelf.unit_cost, counts.Shelf * DEFAULT_CATALOG.Shelf.unit_cost]);
  if (counts.Door) lines.push(['Doors', counts.Door, DEFAULT_CATALOG.Door.unit_cost, counts.Door * DEFAULT_CATALOG.Door.unit_cost]);
  if (counts.Walkway) lines.push(['Walkways', counts.Walkway, DEFAULT_CATALOG.Walkway.unit_cost, counts.Walkway * DEFAULT_CATALOG.Walkway.unit_cost]);
  return { counts, lines };
}

function updateOutput() {
  asciiOutput.textContent = renderAscii();
  const { counts, lines } = computeCostSummary();
  objectCountLabel.textContent = counts.Wall + counts.Shelf + counts.Door + counts.Walkway;
  totalCostLabel.textContent = `$${lines.reduce((sum, [, , , subtotal]) => sum + subtotal, 0).toFixed(2)}`;
  walkwayCountLabel.textContent = counts.Walkway;
  shelfCountLabel.textContent = counts.Shelf;

  if (!lines.length) {
    billOutput.innerHTML = '<p class="bill-empty">No objects placed yet. Click on the grid to build walls, shelves, doors, or walkways.</p>';
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
  for (let row = 0; row < state.height; row += 1) {
    for (let col = 0; col < state.width; col += 1) {
      if (row === 0 || row === state.height - 1 || col === 0 || col === state.width - 1) {
        state.grid[row][col] = 'Wall';
      }
    }
  }
}

function placeDoors() {
  const doorCount = clamp(parseInt(doorCountInput.value, 10) || 2, 1, Math.max(1, Math.floor((state.width - 2) / 2)));
  const topSlots = [];
  const bottomSlots = [];
  const sideSlots = [];

  for (let col = 1; col < state.width - 1; col += 1) {
    topSlots.push({ row: 0, col });
    bottomSlots.push({ row: state.height - 1, col });
  }
  for (let row = 1; row < state.height - 1; row += 1) {
    sideSlots.push({ row, col: 0 });
    sideSlots.push({ row, col: state.width - 1 });
  }

  const positions = topSlots.concat(bottomSlots).concat(sideSlots);
  const step = Math.max(1, Math.floor(positions.length / doorCount));
  for (let i = 0; i < doorCount; i += 1) {
    const index = (i * step + Math.floor(step / 2)) % positions.length;
    const pos = positions[index];
    state.grid[pos.row][pos.col] = 'Door';
  }
}

function placeShelfRows() {
  const walkwayWidth = clamp(parseInt(walkwayInput.value, 10) || 1, 1, Math.max(1, state.height - 3));
  const innerTop = 1;
  const innerBottom = state.height - 2;
  let row = innerTop;

  while (row <= innerBottom) {
    for (let col = 1; col < state.width - 1; col += 1) {
      if (!state.grid[row][col]) {
        state.grid[row][col] = 'Walkway';
      }
    }
    row += walkwayWidth + 1;
    if (row > innerBottom) break;
    for (let col = 1; col < state.width - 1; col += 1) {
      if (!state.grid[row][col]) {
        state.grid[row][col] = 'Shelf';
      }
    }
    row += 1;
  }
}

function applyAutoBuild() {
  state.grid = createGridArray(state.width, state.height);
  placePerimeterWalls();
  placeDoors();
  placeShelfRows();
  refreshSceneObjects();
  updateOutput();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function init() {
  state.grid = createGridArray(state.width, state.height);
  buildPalette();
  makeScene();
  updateLabels();
  updateOutput();
  animate();
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
  updateLabels();
  makeScene();
  refreshSceneObjects();
  updateOutput();
});

autoBuildBtn.addEventListener('click', applyAutoBuild);

resetBtn.addEventListener('click', () => {
  widthInput.value = '12';
  heightInput.value = '18';
  walkwayInput.value = '1';
  doorCountInput.value = '2';
  state.width = 12;
  state.height = 18;
  state.grid = createGridArray(state.width, state.height);
  updateLabels();
  makeScene();
  refreshSceneObjects();
  updateOutput();
});

init();
