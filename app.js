const CELL_SIZE = 1;
const WALL_HEIGHT = 2.6;
const SHELF_HEIGHT = 0.35;
const DOOR_HEIGHT = 1.8;
const DOOR_WIDTH = 0.5;
const FLOOR_COLOR = 0x151f36;
const GRID_LINE_COLOR = 0x2f4b6d;

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
const viewer = document.getElementById('viewer');

const state = {
  width: 12,
  height: 18,
  activeTool: 'Wall',
  grid: [],
  objectGroup: null,
  hoverMesh: null,
  hoveredCell: null,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  raycaster: null,
  pointer: null,
  floorPlane: null,
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
    window.removeEventListener('resize', handleResize);
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
  state.gridGroup = null;
  state.hoverMesh = null;
  state.objectGroup = null;
}

function makeScene() {
  destroyScene();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050816);
  state.scene = scene;

  const aspect = viewer.clientWidth / viewer.clientHeight;
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
  camera.position.set(state.width * 0.8, Math.max(state.width, state.height) * 0.9, state.height * 1.5);
  camera.lookAt((state.width - 1) / 2, 0, (state.height - 1) / 2);
  state.camera = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(viewer.clientWidth, viewer.clientHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  viewer.appendChild(renderer.domElement);
  state.renderer = renderer;

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 6;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.88;
  controls.target.set((state.width - 1) / 2, 0, (state.height - 1) / 2);
  state.controls = controls;

  const ambient = new THREE.HemisphereLight(0x6f8cc7, 0x101820, 0.8);
  scene.add(ambient);
  const rim = new THREE.DirectionalLight(0xe9f1ff, 0.65);
  rim.position.set(-5, 12, 8);
  scene.add(rim);
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(12, 22, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(state.width, state.height, state.width, state.height),
    new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, side: THREE.DoubleSide })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((state.width - 1) / 2, 0, (state.height - 1) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  state.floorPlane = ground;

  const gridGroup = new THREE.Group();
  drawGridLines(gridGroup);
  scene.add(gridGroup);
  state.gridGroup = gridGroup;

  state.objectGroup = new THREE.Group();
  scene.add(state.objectGroup);

  state.hoverMesh = makeHoverMesh();
  scene.add(state.hoverMesh);

  state.raycaster = new THREE.Raycaster();
  state.pointer = new THREE.Vector2();

  window.addEventListener('resize', handleResize);
  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
}

function drawGridLines(group) {
  group.clear();
  const material = new THREE.LineBasicMaterial({ color: GRID_LINE_COLOR, transparent: true, opacity: 0.7 });
  const lines = new THREE.Group();

  for (let x = 0; x <= state.width; x += 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x - 0.5, 0.01, -0.5),
      new THREE.Vector3(x - 0.5, 0.01, state.height - 0.5)
    ]);
    lines.add(new THREE.Line(geometry, material));
  }
  for (let z = 0; z <= state.height; z += 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0.01, z - 0.5),
      new THREE.Vector3(state.width - 0.5, 0.01, z - 0.5)
    ]);
    lines.add(new THREE.Line(geometry, material));
  }

  const edgeGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(state.width, state.height));
  const edgeLine = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 2 }));
  edgeLine.rotation.x = -Math.PI / 2;
  edgeLine.position.copy(state.floorPlane.position);
  group.add(lines, edgeLine);
}

function makeHoverMesh() {
  const geometry = new THREE.PlaneGeometry(CELL_SIZE * 0.98, CELL_SIZE * 0.98);
  const material = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

function buildObjectMesh(type) {
  let geometry;
  let material;
  switch (type) {
    case 'Wall':
      geometry = new THREE.BoxGeometry(CELL_SIZE * 0.85, WALL_HEIGHT, CELL_SIZE * 0.25);
      material = new THREE.MeshPhysicalMaterial({ color: 0x6b7280, metalness: 0.2, roughness: 0.35, clearcoat: 0.1 });
      break;
    case 'Shelf':
      geometry = new THREE.BoxGeometry(CELL_SIZE * 0.9, SHELF_HEIGHT, CELL_SIZE * 0.9);
      material = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.4, metalness: 0.1 });
      break;
    case 'Door':
      geometry = new THREE.BoxGeometry(CELL_SIZE * 0.7, DOOR_HEIGHT, DOOR_WIDTH);
      material = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.25, metalness: 0.15 });
      break;
    case 'Walkway':
      geometry = new THREE.PlaneGeometry(CELL_SIZE * 0.96, CELL_SIZE * 0.96);
      material = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
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
      const x = col;
      const z = row;
      if (cell === 'Walkway') {
        mesh.position.set(x, 0.02, z);
      } else if (cell === 'Wall') {
        mesh.position.set(x, WALL_HEIGHT / 2 - 0.1, z);
        mesh.rotation.y = 0;
      } else if (cell === 'Shelf') {
        mesh.position.set(x, SHELF_HEIGHT / 2, z);
      } else if (cell === 'Door') {
        mesh.position.set(x, DOOR_HEIGHT / 2 - 0.1, z);
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
  if (state.hoverMesh) {
    state.hoverMesh.material.color.set(tool === 'Erase' ? 0xdc2626 : tool === 'Door' ? 0xf97316 : tool === 'Shelf' ? 0x8b5cf6 : tool === 'Walkway' ? 0x0ea5e9 : 0x0ea5e9);
  }
}

function buildPalette() {
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

function handlePointerMove(event) {
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const intersects = state.raycaster.intersectObject(state.floorPlane);
  if (!intersects.length) {
    state.hoverMesh.visible = false;
    state.hoveredCell = null;
    return;
  }
  const point = intersects[0].point;
  const x = clamp(Math.floor(point.x + 0.5), 0, state.width - 1);
  const z = clamp(Math.floor(point.z + 0.5), 0, state.height - 1);
  state.hoveredCell = { x, z };
  state.hoverMesh.position.set(x, 0.03, z);
  state.hoverMesh.visible = true;
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
  return lines;
}

function updateOutput() {
  asciiOutput.textContent = renderAscii();
  const billLines = computeCostSummary();
  if (!billLines.length) {
    billOutput.innerHTML = '<p>No placed objects yet. Click tiles to place walls, shelves, doors, or walkways.</p>';
    return;
  }
  const rows = billLines
    .map(
      ([name, count, cost, subtotal]) =>
        `<tr><td>${name}</td><td>${count}</td><td>$${cost.toFixed(2)}</td><td>$${subtotal.toFixed(2)}</td></tr>`
    )
    .join('');
  const total = billLines.reduce((sum, [, , , subtotal]) => sum + subtotal, 0);
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
  const totalDoors = clamp(parseInt(doorCountInput.value, 10) || 2, 1, state.width - 2);
  const topRow = 0;
  const bottomRow = state.height - 1;
  const doorPositions = [];

  if (totalDoors === 1) {
    doorPositions.push({ row: topRow, col: Math.floor((state.width - 1) / 2) });
  } else {
    const topDoors = Math.ceil(totalDoors / 2);
    const bottomDoors = totalDoors - topDoors;
    const topSpacing = Math.max(1, Math.floor((state.width - 2) / topDoors));
    const bottomSpacing = bottomDoors ? Math.max(1, Math.floor((state.width - 2) / bottomDoors)) : 0;

    for (let i = 0; i < topDoors; i += 1) {
      doorPositions.push({ row: topRow, col: clamp(1 + i * topSpacing, 1, state.width - 2) });
    }
    for (let i = 0; i < bottomDoors; i += 1) {
      doorPositions.push({ row: bottomRow, col: clamp(1 + i * bottomSpacing, 1, state.width - 2) });
    }
  }

  doorPositions.forEach(({ row, col }) => {
    state.grid[row][col] = 'Door';
  });
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
    row += walkwayWidth;
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

function clearGrid() {
  state.grid = createGridArray(state.width, state.height);
  refreshSceneObjects();
  updateOutput();
}

function updateSceneSize() {
  if (state.floorPlane) state.scene.remove(state.floorPlane);
  if (state.gridGroup) state.scene.remove(state.gridGroup);
  if (state.hoverMesh) state.scene.remove(state.hoverMesh);
  if (state.objectGroup) state.scene.remove(state.objectGroup);
  makeScene();
  refreshSceneObjects();
  updateOutput();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function handleResize() {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  state.controls.update();
  state.renderer.render(state.scene, state.camera);
}

resizeBtn.addEventListener('click', () => {
  state.width = clamp(parseInt(widthInput.value, 10) || 12, 3, 40);
  state.height = clamp(parseInt(heightInput.value, 10) || 18, 3, 40);
  state.grid = createGridArray(state.width, state.height);
  updateLabels();
  updateSceneSize();
});

autoBuildBtn.addEventListener('click', () => {
  applyAutoBuild();
});

resetBtn.addEventListener('click', () => {
  widthInput.value = '12';
  heightInput.value = '18';
  walkwayInput.value = '1';
  doorCountInput.value = '2';
  state.width = 12;
  state.height = 18;
  state.grid = createGridArray(state.width, state.height);
  updateLabels();
  updateSceneSize();
});

function init() {
  state.grid = createGridArray(state.width, state.height);
  buildPalette();
  makeScene();
  updateLabels();
  updateOutput();
  animate();
}

init();
