import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const HOVER_COLOR = new THREE.Color('#f5f5f0');
const WALL_MAIN_COLOR = '#d6c8a9';
const WALL_RECESSED_COLOR = '#c4b694';
const ROOF_COLOR = '#4d5c4a';
const ROOF_ACCENT_COLOR = '#5e6e58';
const DOOR_COLOR = '#6b3a20';
const BRASS_COLOR = '#b89845';
const WINDOW_LIGHT_COLOR = '#a1c4d6';
const WINDOW_DEEP_COLOR = '#7dafc4';
const STRUCTURE_LIGHT_COLOR = '#b8b3a3';
const STRUCTURE_DARK_COLOR = '#9a9588';

function isWindowLikeName(lowerName) {
  return (
    lowerName.includes('window') ||
    lowerName.includes('glazing') ||
    lowerName.includes('sidelight') ||
    lowerName.includes('single-flush')
  );
}

function isDoorLikeName(lowerName) {
  return lowerName.includes('front-door') || lowerName.includes('panel-door') || lowerName.includes('door-outward');
}

function cloneMaterial(material, name) {
  const lowerName = name?.toLowerCase() || '';
  let color = WALL_MAIN_COLOR;

  if (lowerName.includes('handle') || lowerName.includes('knob') || lowerName.includes('hardware')) {
    color = BRASS_COLOR;
  } else if (lowerName.includes('roof')) {
    color = lowerName.includes('ridge') || lowerName.includes('trim') ? ROOF_ACCENT_COLOR : ROOF_COLOR;
  } else if (isDoorLikeName(lowerName)) {
    color = DOOR_COLOR;
  } else if (isWindowLikeName(lowerName)) {
    color = WINDOW_LIGHT_COLOR;
  } else if (
    lowerName.includes('column') ||
    lowerName.includes('pillar') ||
    lowerName.includes('foundation') ||
    lowerName.includes('beam') ||
    lowerName.includes('slab') ||
    lowerName.includes('concrete')
  ) {
    color = lowerName.includes('foundation') || lowerName.includes('slab') ? STRUCTURE_DARK_COLOR : STRUCTURE_LIGHT_COLOR;
  } else if (
    lowerName.includes('cladding') ||
    lowerName.includes('generic_model') ||
    lowerName.includes('panel') ||
    lowerName.includes('recess') ||
    lowerName.includes('siding')
  ) {
    color = WALL_RECESSED_COLOR;
  }

  return new THREE.MeshBasicMaterial({
    name: `${name || 'component'}_neutral_material`,
    color,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createFallbackBuilding() {
  const group = new THREE.Group();
  group.name = 'Fallback_Building';

  const wallMaterial = new THREE.MeshBasicMaterial({
    color: WALL_MAIN_COLOR,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const accentMaterial = new THREE.MeshBasicMaterial({
    color: ROOF_COLOR,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const wall = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.2, 5.2), wallMaterial.clone());
  wall.name = 'Wall_1';
  wall.position.y = 1.6;
  group.add(wall);

  const recessedPanelMaterial = wallMaterial.clone();
  recessedPanelMaterial.color.set(WALL_RECESSED_COLOR);
  const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.08), recessedPanelMaterial);
  frontPanel.name = 'Wall_Recessed_Panel_1';
  frontPanel.position.set(0, 1.65, -2.64);
  group.add(frontPanel);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.55, 6.1), accentMaterial.clone());
  roof.name = 'Roof_1';
  roof.position.y = 3.55;
  roof.rotation.z = -0.02;
  group.add(roof);

  const beamMaterial = wallMaterial.clone();
  beamMaterial.color.set(STRUCTURE_LIGHT_COLOR);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.34, 0.36), beamMaterial);
  beam.name = 'Beam_1';
  beam.position.set(0, 3.1, -2.8);
  group.add(beam);

  const columnMaterial = wallMaterial.clone();
  columnMaterial.color.set(STRUCTURE_LIGHT_COLOR);
  [[-3.1, -2.2], [3.1, -2.2], [-3.1, 2.2], [3.1, 2.2]].forEach(([x, z], index) => {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 3.2, 18), columnMaterial.clone());
    column.name = index === 0 ? 'Column_1' : `Column_${index + 1}`;
    column.position.set(x, 1.6, z);
    group.add(column);
  });

  return group;
}

export function loadBuildingModel({ scene, url = '/building.glb', onProgress, onLoaded }) {
  const loader = new GLTFLoader();

  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        prepareModel(model);
        scene.add(model);
        onLoaded?.(model, false);
        resolve({ model, usedFallback: false });
      },
      (event) => {
        if (event.total > 0) {
          onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
      },
      () => {
        const model = createFallbackBuilding();
        prepareModel(model);
        scene.add(model);
        onLoaded?.(model, true);
        resolve({ model, usedFallback: true });
      },
    );
  });
}

export function prepareModel(model) {
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());

  if (size.z < size.x * 0.6 && size.z < size.y * 0.6) {
    model.rotation.x = -Math.PI / 2;
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    size = box.getSize(new THREE.Vector3());
  }

  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = 11 / maxAxis;

  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  model.updateMatrixWorld(true);
  model.userData.baseScale = scale;
  model.userData.basePositionY = model.position.y;

  const modelBox = new THREE.Box3().setFromObject(model);
  const modelSize = modelBox.getSize(new THREE.Vector3());

  model.traverse((child) => {
    if (!child.isMesh) return;

    const childBox = new THREE.Box3().setFromObject(child);
    const childSize = childBox.getSize(new THREE.Vector3());
    const childCenter = childBox.getCenter(new THREE.Vector3());
    const isTinyAccessory = Math.max(childSize.x, childSize.y, childSize.z) < modelSize.x * 0.16;
    const isRightEdgeAccessory = childCenter.x > modelBox.max.x - modelSize.x * 0.2;
    const isExportedTrim = child.name.includes('Basic_Wall_metal_cladding');

    if (isTinyAccessory && isRightEdgeAccessory && isExportedTrim) {
      child.visible = false;
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;
    child.material = cloneMaterial(child.material, child.name);
    child.userData.baseColor = child.material.color.clone();
    child.userData.sensorShake = 0;
  });
}

export function setHoverState(mesh, isHovered) {
  if (!mesh?.material) return;

  if (isHovered) {
    mesh.material.color.copy(HOVER_COLOR);
    return;
  }

  applySensorVisual(mesh, mesh.userData.lastSensorValues || {});
}

export function applySensorVisual(mesh, values = {}) {
  if (!mesh?.material) return;

  const baseColor = mesh.userData.baseColor || new THREE.Color('#eeeeee');
  mesh.material.color.copy(baseColor);
  mesh.userData.sensorShake = 0;
  mesh.userData.lastSensorValues = values;
}
