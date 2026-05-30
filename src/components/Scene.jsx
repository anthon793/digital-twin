import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createOrbitControls } from './Controls.jsx';
import { applySensorVisual, loadBuildingModel, setHoverState } from './Model.jsx';
import {
  clearDigitalTwinContext,
  createMockSensorData,
  setDigitalTwinContext,
  summarizeSensorData,
  updateSensorData,
} from '../utils/sensorUpdater.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(10, 10);
const CAMERA_SIZE = 5.7;
const DEFAULT_CAMERA_ZOOM = 1.1;
const INTERIOR_REVEAL_START = 1.75;
const INTERIOR_REVEAL_END = 3.15;
const INTERIOR_REVEAL_SMOOTHING = 5.5;
const ROOF_ENTRY_ANGLE_START = Math.PI * 0.44;
const ROOF_ENTRY_ANGLE_END = Math.PI * 0.27;
const EXTERIOR_HIDE_PROGRESS = 0.58;
const INTERIOR_LOCK_PROGRESS = 0.94;

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
    }
  });
}

function SensorRow({ item }) {
  return (
    <li className="sensor-row">
      <span className={`status-dot ${item.status}`} />
      <span className="sensor-name">{item.componentName}</span>
      <span className="sensor-values">
        {Object.entries(item.values)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' / ')}
      </span>
    </li>
  );
}

function formatComponentName(name = '') {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('roof')) return 'Roof Section';
  if (lowerName.includes('door')) return 'Door Area';
  if (lowerName.includes('window')) return 'Window Section';
  if (lowerName.includes('cladding')) return 'Wall Cladding';
  if (lowerName.includes('wall')) return 'Wall Section';
  if (lowerName.includes('floor')) return 'Floor Slab';
  if (lowerName.includes('beam')) return 'Beam';
  if (lowerName.includes('column')) return 'Column';

  return name
    .replace(/_Geometry(_\d+)?$/i, '')
    .replace(/_\d+$/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'House Component';
}

function createHouseSetting() {
  const group = new THREE.Group();
  group.name = 'Classic_House_Garden_Setting';
  group.userData.windTargets = [];

  const materials = {
    grass: new THREE.MeshStandardMaterial({ color: '#315f35', roughness: 0.9 }),
    grassDark: new THREE.MeshStandardMaterial({ color: '#244c2a', roughness: 0.94 }),
    path: new THREE.MeshStandardMaterial({ color: '#b9aa8e', roughness: 0.82 }),
    flowerPink: new THREE.MeshStandardMaterial({ color: '#e7679d', roughness: 0.65 }),
    flowerYellow: new THREE.MeshStandardMaterial({ color: '#f3c94f', roughness: 0.65 }),
    flowerWhite: new THREE.MeshStandardMaterial({ color: '#f7efe0', roughness: 0.65 }),
    hedge: new THREE.MeshStandardMaterial({ color: '#2f7d44', roughness: 0.8 }),
    bark: new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.85 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f8f46', roughness: 0.8 }),
    fence: new THREE.MeshStandardMaterial({ color: '#d7c4a3', roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ color: '#8b8d84', roughness: 0.8 }),
  };

  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), materials.grass);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, -0.02, 0);
  lawn.receiveShadow = true;
  group.add(lawn);

  const backLawn = new THREE.Mesh(new THREE.PlaneGeometry(34, 8), materials.grassDark);
  backLawn.rotation.x = -Math.PI / 2;
  backLawn.position.set(0, -0.015, 6.2);
  backLawn.receiveShadow = true;
  group.add(backLawn);

  [-6.2, 6.2].forEach((zCenter) => {
    const path = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.04, 9.2), materials.path);
    path.position.set(0, 0.01, zCenter);
    path.receiveShadow = true;
    group.add(path);

    [-1.15, 1.15].forEach((x) => {
      const border = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 9.4), materials.stone);
      border.position.set(x, 0.045, zCenter);
      border.castShadow = true;
      group.add(border);
    });
  });

  [-4.45, 4.45].forEach((z) => {
    const landing = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.055, 0.95), materials.path);
    landing.position.set(0, 0.04, z);
    landing.receiveShadow = true;
    group.add(landing);

    [-1.34, 1.34].forEach((x) => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 1.05), materials.stone);
      edge.position.set(x, 0.065, z);
      edge.castShadow = true;
      group.add(edge);
    });
  });

  [5.1, 6.3, 7.5, -5.1, -6.3, -7.5].forEach((z, index) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.055, 0.58), materials.stone);
    slab.position.set(index % 2 === 0 ? -0.18 : 0.18, 0.075, z);
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
  });

  [-5.7, -3.25, -0.8].forEach((z) => {
    [-0.45, 0.45].forEach((x) => {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.045, 24), materials.stone);
      stone.position.set(x, 0.07, z);
      stone.rotation.y = z * 0.2;
      stone.castShadow = true;
      group.add(stone);
    });
  });

  const shrubGeometry = new THREE.SphereGeometry(0.34, 16, 10);
  const flowerGeometry = new THREE.SphereGeometry(0.075, 10, 8);
  const flowerMaterials = [materials.flowerPink, materials.flowerYellow, materials.flowerWhite];
  const gardenRows = [
    { x: -5.9, z: -2.8 },
    { x: -4.9, z: -3.25 },
    { x: -3.9, z: -2.85 },
    { x: 3.9, z: -2.85 },
    { x: 4.9, z: -3.25 },
    { x: 5.9, z: -2.8 },
  ];

  gardenRows.forEach((spot, index) => {
    const shrub = new THREE.Mesh(shrubGeometry, materials.hedge);
    shrub.position.set(spot.x, 0.28, spot.z);
    shrub.scale.set(1.25, 0.72, 0.85);
    shrub.castShadow = true;
    group.userData.windTargets.push({ object: shrub, amount: 0.035, phase: index * 0.8 });
    group.add(shrub);

    for (let i = 0; i < 5; i += 1) {
      const flower = new THREE.Mesh(flowerGeometry, flowerMaterials[(index + i) % flowerMaterials.length]);
      flower.position.set(spot.x - 0.34 + i * 0.17, 0.5 + Math.sin(i) * 0.03, spot.z - 0.12 + (i % 2) * 0.18);
      flower.castShadow = true;
      group.add(flower);
    }
  });

  function addTree(x, z, scale = 1) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 1.2 * scale, 12), materials.bark);
    trunk.position.set(x, 0.6 * scale, z);
    trunk.castShadow = true;
    group.add(trunk);

    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.88 * scale, 1.8 * scale, 18), materials.leaf);
    crown.position.set(x, 1.7 * scale, z);
    crown.castShadow = true;
    group.userData.windTargets.push({ object: crown, amount: 0.045, phase: x + z });
    group.add(crown);
  }

  addTree(-8.2, -1.2, 1);
  addTree(8.2, -1.6, 0.92);
  addTree(-7.5, 5.2, 0.82);
  addTree(7.6, 5.1, 0.78);

  for (let i = -7; i <= 7; i += 1) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.78, 0.12), materials.fence);
    post.position.set(i * 1.05, 0.38, -9.2);
    post.castShadow = true;
    group.add(post);
  }

  [-9.05, -8.65].forEach((z) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.1, 0.12), materials.fence);
    rail.position.set(0, z === -9.05 ? 0.55 : 0.25, z);
    rail.castShadow = true;
    group.add(rail);
  });

  return group;
}

function createInteriorDetails(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const group = new THREE.Group();
  group.name = 'Interior_Reveal';
  group.userData.materials = [];

  const interiorWidth = Math.max(size.x * 0.68, 3.8);
  const interiorDepth = Math.max(size.z * 0.62, 3.2);
  const floorY = box.min.y + size.y * 0.08;
  const wallHeight = Math.max(size.y * 0.28, 1.3);
  const wallY = floorY + wallHeight * 0.5;
  const roomSurfaceY = floorY + 0.16;

  const makeMaterial = (color, options = {}) => {
    const {
      emissive = '#000000',
      emissiveIntensity = 0,
      roughness = 0.68,
      metalness = 0.03,
      depthWrite = true,
    } = options;
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
      transparent: true,
      opacity: 0,
      depthWrite,
    });
    group.userData.materials.push(material);
    return material;
  };

  const createLabelMaterial = (text, color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(10, 14, 18, 0.72)';
    context.fillRect(28, 44, 456, 104);
    context.strokeStyle = color;
    context.lineWidth = 10;
    context.strokeRect(28, 44, 456, 104);
    context.fillStyle = '#fff8df';
    context.font = '800 58px Inter, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 98);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    group.userData.materials.push(material);
    group.userData.textures = group.userData.textures || [];
    group.userData.textures.push(texture);
    return material;
  };

  const floorBaseMaterial = makeMaterial('#352b24', { emissive: '#17110c', emissiveIntensity: 0.12 });
  const livingFloorMaterial = makeMaterial('#ff9a2e', { emissive: '#7a3100', emissiveIntensity: 0.35 });
  const kitchenFloorMaterial = makeMaterial('#00b8c8', { emissive: '#00434a', emissiveIntensity: 0.38 });
  const bedroomFloorMaterial = makeMaterial('#61c95f', { emissive: '#165b18', emissiveIntensity: 0.34 });
  const serviceFloorMaterial = makeMaterial('#b985ff', { emissive: '#3c1c73', emissiveIntensity: 0.34 });
  const rugMaterial = makeMaterial('#246d91', { emissive: '#06283a', emissiveIntensity: 0.24 });
  const innerWallMaterial = makeMaterial('#fff1ca', { emissive: '#5f4725', emissiveIntensity: 0.18 });
  const livingWallMaterial = makeMaterial('#ff5a35', { emissive: '#741600', emissiveIntensity: 0.28 });
  const kitchenWallMaterial = makeMaterial('#00d5cf', { emissive: '#004845', emissiveIntensity: 0.28 });
  const bedroomWallMaterial = makeMaterial('#7bea62', { emissive: '#235d13', emissiveIntensity: 0.28 });
  const serviceWallMaterial = makeMaterial('#c498ff', { emissive: '#3d1f72', emissiveIntensity: 0.26 });
  const trimMaterial = makeMaterial('#2a1b10', { emissive: '#080401', emissiveIntensity: 0.14 });
  const boundaryMaterial = makeMaterial('#fff7be', { emissive: '#ffb23f', emissiveIntensity: 0.85 });
  const sofaMaterial = makeMaterial('#315e70', { emissive: '#08222c', emissiveIntensity: 0.2 });
  const tableMaterial = makeMaterial('#9a5c2e', { emissive: '#2e1305', emissiveIntensity: 0.12 });
  const bedMaterial = makeMaterial('#63a877', { emissive: '#12351d', emissiveIntensity: 0.16 });
  const counterMaterial = makeMaterial('#d6d2bd', { emissive: '#3b392d', emissiveIntensity: 0.14 });
  const lampMaterial = makeMaterial('#ffd37a', { emissive: '#ffb23f', emissiveIntensity: 1.65, roughness: 0.35 });
  const applianceMaterial = makeMaterial('#eef7fb', { emissive: '#3c4f55', emissiveIntensity: 0.18, roughness: 0.42 });
  const stoveMaterial = makeMaterial('#252a31', { emissive: '#05070a', emissiveIntensity: 0.2, roughness: 0.36 });
  const mattressMaterial = makeMaterial('#f5f0df', { emissive: '#4f4632', emissiveIntensity: 0.14 });
  const blanketMaterial = makeMaterial('#3f7fd1', { emissive: '#0b2b5c', emissiveIntensity: 0.22 });
  const bathFixtureMaterial = makeMaterial('#f7fbff', { emissive: '#50616e', emissiveIntensity: 0.18, roughness: 0.34 });
  const screenMaterial = makeMaterial('#121820', { emissive: '#1e6a8f', emissiveIntensity: 0.42, roughness: 0.28 });
  const bookRedMaterial = makeMaterial('#e54b4b', { emissive: '#4a0d0d', emissiveIntensity: 0.16 });
  const bookYellowMaterial = makeMaterial('#ffd166', { emissive: '#5a3900', emissiveIntensity: 0.16 });
  const plantMaterial = makeMaterial('#30a85a', { emissive: '#0d3d1d', emissiveIntensity: 0.18 });
  const utensilMaterial = makeMaterial('#f4efe5', { emissive: '#4b463d', emissiveIntensity: 0.2, metalness: 0.12 });
  const potMaterial = makeMaterial('#30343b', { emissive: '#08090b', emissiveIntensity: 0.16, metalness: 0.18 });
  const wardrobeMaterial = makeMaterial('#6b4a2d', { emissive: '#1d0f06', emissiveIntensity: 0.12 });
  const mirrorMaterial = makeMaterial('#a7e5ff', {
    emissive: '#236a86',
    emissiveIntensity: 0.5,
    roughness: 0.18,
    metalness: 0.2,
    depthWrite: false,
  });
  const towelMaterial = makeMaterial('#ff7da8', { emissive: '#5c1230', emissiveIntensity: 0.22 });
  const remoteMaterial = makeMaterial('#151515', { emissive: '#020202', emissiveIntensity: 0.12 });
  const plateMaterial = makeMaterial('#fff6dc', { emissive: '#5b5035', emissiveIntensity: 0.16, roughness: 0.34 });
  const cupMaterial = makeMaterial('#f07a4a', { emissive: '#5f1f0a', emissiveIntensity: 0.18 });
  const soapMaterial = makeMaterial('#7ee0ff', { emissive: '#14657f', emissiveIntensity: 0.28 });
  const brushMaterial = makeMaterial('#fff7e0', { emissive: '#5b5035', emissiveIntensity: 0.12 });
  const clothingMaterial = makeMaterial('#ef6f9f', { emissive: '#5c1531', emissiveIntensity: 0.2 });
  const waterMaterial = makeMaterial('#5cc8ff', {
    emissive: '#0f5f85',
    emissiveIntensity: 0.44,
    roughness: 0.22,
    depthWrite: false,
  });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth, 0.08, interiorDepth), floorBaseMaterial);
  floor.position.set(center.x, floorY, center.z);
  floor.receiveShadow = true;
  group.add(floor);

  const rooms = [
    { name: 'LIVING', x: -0.25, z: -0.25, w: 0.5, d: 0.5, material: livingFloorMaterial, labelColor: '#ff9a2e' },
    { name: 'KITCHEN', x: 0.3, z: -0.26, w: 0.4, d: 0.48, material: kitchenFloorMaterial, labelColor: '#00d5cf' },
    { name: 'BEDROOM', x: 0.3, z: 0.28, w: 0.4, d: 0.44, material: bedroomFloorMaterial, labelColor: '#7bea62' },
    { name: 'BATH', x: -0.27, z: 0.28, w: 0.46, d: 0.44, material: serviceFloorMaterial, labelColor: '#c498ff' },
  ];

  rooms.forEach((room) => {
    const roomFloor = new THREE.Mesh(
      new THREE.BoxGeometry(interiorWidth * room.w, 0.11, interiorDepth * room.d),
      room.material,
    );
    roomFloor.position.set(center.x + interiorWidth * room.x, roomSurfaceY, center.z + interiorDepth * room.z);
    roomFloor.receiveShadow = true;
    group.add(roomFloor);

    const label = new THREE.Sprite(createLabelMaterial(room.name, room.labelColor));
    label.position.set(center.x + interiorWidth * room.x, roomSurfaceY + 0.34, center.z + interiorDepth * room.z);
    label.scale.set(interiorWidth * 0.3, interiorWidth * 0.11, 1);
    label.renderOrder = 4;
    group.add(label);
  });

  const rug = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.36, 0.045, interiorDepth * 0.28), rugMaterial);
  rug.position.set(center.x - interiorWidth * 0.22, roomSurfaceY + 0.075, center.z - interiorDepth * 0.2);
  rug.receiveShadow = true;
  group.add(rug);

  const dividerA = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallHeight, interiorDepth * 0.82), innerWallMaterial);
  dividerA.position.set(center.x + interiorWidth * 0.08, wallY, center.z);
  dividerA.castShadow = true;
  group.add(dividerA);

  const dividerB = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.52, wallHeight, 0.08), innerWallMaterial);
  dividerB.position.set(center.x - interiorWidth * 0.2, wallY, center.z + interiorDepth * 0.16);
  dividerB.castShadow = true;
  group.add(dividerB);

  [
    { x: -0.25, z: -0.49, w: 0.48, d: 0.04, material: livingWallMaterial },
    { x: 0.3, z: -0.49, w: 0.36, d: 0.04, material: kitchenWallMaterial },
    { x: 0.49, z: 0.28, w: 0.04, d: 0.4, material: bedroomWallMaterial },
    { x: -0.49, z: 0.28, w: 0.04, d: 0.4, material: serviceWallMaterial },
  ].forEach((panel) => {
    const accentPanel = new THREE.Mesh(
      new THREE.BoxGeometry(interiorWidth * panel.w, wallHeight * 0.82, interiorDepth * panel.d),
      panel.material,
    );
    accentPanel.position.set(center.x + interiorWidth * panel.x, wallY, center.z + interiorDepth * panel.z);
    accentPanel.castShadow = true;
    group.add(accentPanel);
  });

  const sofa = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.28, 0.34, interiorDepth * 0.12), sofaMaterial);
  sofa.position.set(center.x - interiorWidth * 0.28, floorY + 0.24, center.z - interiorDepth * 0.28);
  sofa.castShadow = true;
  group.add(sofa);

  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.28, 0.48, 0.09), sofaMaterial);
  sofaBack.position.set(sofa.position.x, floorY + 0.44, sofa.position.z + interiorDepth * 0.08);
  sofaBack.castShadow = true;
  group.add(sofaBack);

  const table = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.18, 0.16, interiorDepth * 0.12), tableMaterial);
  table.position.set(center.x - interiorWidth * 0.12, floorY + 0.2, center.z - interiorDepth * 0.12);
  table.castShadow = true;
  group.add(table);

  const remote = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.045, 0.025, interiorDepth * 0.02), remoteMaterial);
  remote.position.set(table.position.x - interiorWidth * 0.025, floorY + 0.295, table.position.z);
  remote.castShadow = true;
  group.add(remote);

  [-0.04, 0.04].forEach((offset) => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(interiorWidth * 0.018, interiorWidth * 0.02, 0.07, 16), cupMaterial);
    cup.position.set(table.position.x + interiorWidth * offset, floorY + 0.32, table.position.z + interiorDepth * 0.035);
    cup.castShadow = true;
    group.add(cup);
  });

  const tvStand = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.24, 0.15, interiorDepth * 0.06), tableMaterial);
  tvStand.position.set(center.x - interiorWidth * 0.42, floorY + 0.2, center.z - interiorDepth * 0.02);
  tvStand.castShadow = true;
  group.add(tvStand);

  const tvScreen = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.2, 0.22, 0.035), screenMaterial);
  tvScreen.position.set(tvStand.position.x, floorY + 0.42, tvStand.position.z + interiorDepth * 0.04);
  tvScreen.castShadow = true;
  group.add(tvScreen);

  const bookshelf = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.07, 0.5, interiorDepth * 0.18), tableMaterial);
  bookshelf.position.set(center.x - interiorWidth * 0.49, floorY + 0.36, center.z - interiorDepth * 0.28);
  bookshelf.castShadow = true;
  group.add(bookshelf);

  [bookRedMaterial, bookYellowMaterial, rugMaterial, plantMaterial].forEach((material, index) => {
    const book = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.018, 0.16, interiorDepth * 0.035), material);
    book.position.set(
      bookshelf.position.x,
      floorY + 0.23 + (index % 2) * 0.18,
      bookshelf.position.z - interiorDepth * 0.055 + index * interiorDepth * 0.035,
    );
    book.castShadow = true;
    group.add(book);
  });

  const plantPot = new THREE.Mesh(new THREE.CylinderGeometry(interiorWidth * 0.035, interiorWidth * 0.045, 0.12, 16), tableMaterial);
  plantPot.position.set(center.x - interiorWidth * 0.44, floorY + 0.2, center.z - interiorDepth * 0.43);
  plantPot.castShadow = true;
  group.add(plantPot);

  const plantTop = new THREE.Mesh(new THREE.SphereGeometry(interiorWidth * 0.065, 14, 10), plantMaterial);
  plantTop.position.set(plantPot.position.x, floorY + 0.34, plantPot.position.z);
  plantTop.castShadow = true;
  group.add(plantTop);

  [-0.39, -0.3].forEach((xOffset, index) => {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(interiorWidth * 0.055, 0.16, 0.025),
      index === 0 ? bookYellowMaterial : bookRedMaterial,
    );
    frame.position.set(center.x + interiorWidth * xOffset, floorY + 0.64, center.z - interiorDepth * 0.5);
    frame.castShadow = true;
    group.add(frame);
  });

  const bed = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.3, 0.18, interiorDepth * 0.28), bedMaterial);
  bed.position.set(center.x + interiorWidth * 0.3, floorY + 0.22, center.z + interiorDepth * 0.24);
  bed.castShadow = true;
  group.add(bed);

  const mattress = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.27, 0.1, interiorDepth * 0.25), mattressMaterial);
  mattress.position.set(bed.position.x, floorY + 0.35, bed.position.z);
  mattress.castShadow = true;
  group.add(mattress);

  const blanket = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.27, 0.08, interiorDepth * 0.14), blanketMaterial);
  blanket.position.set(bed.position.x, floorY + 0.43, bed.position.z - interiorDepth * 0.04);
  blanket.castShadow = true;
  group.add(blanket);

  const pillow = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.2, 0.09, interiorDepth * 0.06), innerWallMaterial);
  pillow.position.set(bed.position.x, floorY + 0.48, bed.position.z + interiorDepth * 0.09);
  pillow.castShadow = true;
  group.add(pillow);

  const headboard = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.32, 0.42, interiorDepth * 0.045), tableMaterial);
  headboard.position.set(bed.position.x, floorY + 0.37, bed.position.z + interiorDepth * 0.16);
  headboard.castShadow = true;
  group.add(headboard);

  [-0.16, 0.16].forEach((offset) => {
    const bedside = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.07, 0.18, interiorDepth * 0.07), tableMaterial);
    bedside.position.set(bed.position.x + interiorWidth * offset, floorY + 0.21, bed.position.z - interiorDepth * 0.16);
    bedside.castShadow = true;
    group.add(bedside);
  });

  const wardrobe = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.11, 0.78, interiorDepth * 0.16), wardrobeMaterial);
  wardrobe.position.set(center.x + interiorWidth * 0.49, floorY + 0.5, center.z + interiorDepth * 0.34);
  wardrobe.castShadow = true;
  group.add(wardrobe);

  const desk = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.16, 0.16, interiorDepth * 0.08), tableMaterial);
  desk.position.set(center.x + interiorWidth * 0.16, floorY + 0.24, center.z + interiorDepth * 0.42);
  desk.castShadow = true;
  group.add(desk);

  const deskLamp = new THREE.Mesh(new THREE.ConeGeometry(interiorWidth * 0.035, 0.12, 16), lampMaterial);
  deskLamp.position.set(desk.position.x - interiorWidth * 0.04, floorY + 0.4, desk.position.z);
  deskLamp.castShadow = true;
  group.add(deskLamp);

  const laptop = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.09, 0.025, interiorDepth * 0.055), screenMaterial);
  laptop.position.set(desk.position.x + interiorWidth * 0.04, floorY + 0.34, desk.position.z);
  laptop.castShadow = true;
  group.add(laptop);

  const foldedClothes = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.09, 0.06, interiorDepth * 0.06), clothingMaterial);
  foldedClothes.position.set(center.x + interiorWidth * 0.42, floorY + 0.18, center.z + interiorDepth * 0.14);
  foldedClothes.castShadow = true;
  group.add(foldedClothes);

  [-0.025, 0.025].forEach((offset) => {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.045, 0.045, interiorDepth * 0.08), remoteMaterial);
    shoe.position.set(center.x + interiorWidth * (0.18 + offset), floorY + 0.17, center.z + interiorDepth * 0.2);
    shoe.castShadow = true;
    group.add(shoe);
  });

  const counter = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.26, 0.42, interiorDepth * 0.1), counterMaterial);
  counter.position.set(center.x + interiorWidth * 0.28, floorY + 0.28, center.z - interiorDepth * 0.25);
  counter.castShadow = true;
  group.add(counter);

  const kitchenIsland = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.16, 0.32, interiorDepth * 0.13), counterMaterial);
  kitchenIsland.position.set(center.x + interiorWidth * 0.34, floorY + 0.25, center.z - interiorDepth * 0.08);
  kitchenIsland.castShadow = true;
  group.add(kitchenIsland);

  const fridge = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.09, 0.74, interiorDepth * 0.11), applianceMaterial);
  fridge.position.set(center.x + interiorWidth * 0.48, floorY + 0.48, center.z - interiorDepth * 0.33);
  fridge.castShadow = true;
  group.add(fridge);

  const stove = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.1, 0.08, interiorDepth * 0.09), stoveMaterial);
  stove.position.set(center.x + interiorWidth * 0.22, floorY + 0.52, center.z - interiorDepth * 0.25);
  stove.castShadow = true;
  group.add(stove);

  const sink = new THREE.Mesh(new THREE.CylinderGeometry(interiorWidth * 0.035, interiorWidth * 0.04, 0.05, 24), waterMaterial);
  sink.position.set(center.x + interiorWidth * 0.36, floorY + 0.53, center.z - interiorDepth * 0.25);
  sink.rotation.x = Math.PI / 2;
  group.add(sink);

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(interiorWidth * 0.045, interiorWidth * 0.055, 0.08, 24), potMaterial);
  pot.position.set(center.x + interiorWidth * 0.22, floorY + 0.59, center.z - interiorDepth * 0.25);
  pot.castShadow = true;
  group.add(pot);

  [-0.045, 0, 0.045].forEach((offset, index) => {
    const utensil = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, interiorDepth * 0.12, 8), utensilMaterial);
    utensil.position.set(center.x + interiorWidth * (0.38 + offset), floorY + 0.62, center.z - interiorDepth * 0.08);
    utensil.rotation.x = Math.PI * (0.42 + index * 0.04);
    utensil.rotation.z = index * 0.2;
    utensil.castShadow = true;
    group.add(utensil);
  });

  const choppingBoard = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.1, 0.035, interiorDepth * 0.07), tableMaterial);
  choppingBoard.position.set(center.x + interiorWidth * 0.34, floorY + 0.43, center.z - interiorDepth * 0.08);
  choppingBoard.castShadow = true;
  group.add(choppingBoard);

  [-0.025, 0.035].forEach((offset) => {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(interiorWidth * 0.035, interiorWidth * 0.035, 0.018, 24), plateMaterial);
    plate.position.set(center.x + interiorWidth * (0.32 + offset), floorY + 0.43, center.z - interiorDepth * 0.015);
    plate.rotation.x = Math.PI / 2;
    plate.castShadow = true;
    group.add(plate);
  });

  const kettle = new THREE.Mesh(new THREE.SphereGeometry(interiorWidth * 0.04, 18, 12), applianceMaterial);
  kettle.position.set(center.x + interiorWidth * 0.43, floorY + 0.43, center.z - interiorDepth * 0.08);
  kettle.scale.set(1, 0.75, 1);
  kettle.castShadow = true;
  group.add(kettle);

  const tub = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.24, 0.18, interiorDepth * 0.12), bathFixtureMaterial);
  tub.position.set(center.x - interiorWidth * 0.34, floorY + 0.23, center.z + interiorDepth * 0.42);
  tub.castShadow = true;
  group.add(tub);

  const tubWater = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.2, 0.035, interiorDepth * 0.08), waterMaterial);
  tubWater.position.set(tub.position.x, floorY + 0.34, tub.position.z);
  group.add(tubWater);

  const vanity = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.14, 0.28, interiorDepth * 0.08), bathFixtureMaterial);
  vanity.position.set(center.x - interiorWidth * 0.43, floorY + 0.25, center.z + interiorDepth * 0.27);
  vanity.castShadow = true;
  group.add(vanity);

  const mirror = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.12, 0.2, 0.025), mirrorMaterial);
  mirror.position.set(vanity.position.x, floorY + 0.58, vanity.position.z - interiorDepth * 0.055);
  mirror.castShadow = true;
  group.add(mirror);

  const towel = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.08, 0.18, 0.025), towelMaterial);
  towel.position.set(center.x - interiorWidth * 0.13, floorY + 0.42, center.z + interiorDepth * 0.43);
  towel.castShadow = true;
  group.add(towel);

  const toilet = new THREE.Mesh(new THREE.CylinderGeometry(interiorWidth * 0.045, interiorWidth * 0.055, 0.16, 24), bathFixtureMaterial);
  toilet.position.set(center.x - interiorWidth * 0.17, floorY + 0.24, center.z + interiorDepth * 0.31);
  toilet.castShadow = true;
  group.add(toilet);

  const toiletTank = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.09, 0.12, interiorDepth * 0.045), bathFixtureMaterial);
  toiletTank.position.set(toilet.position.x, floorY + 0.36, toilet.position.z + interiorDepth * 0.055);
  toiletTank.castShadow = true;
  group.add(toiletTank);

  const soap = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * 0.04, 0.035, interiorDepth * 0.03), soapMaterial);
  soap.position.set(vanity.position.x + interiorWidth * 0.035, floorY + 0.42, vanity.position.z);
  soap.castShadow = true;
  group.add(soap);

  [-0.012, 0.012].forEach((offset) => {
    const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), brushMaterial);
    brush.position.set(vanity.position.x - interiorWidth * 0.025 + interiorWidth * offset, floorY + 0.47, vanity.position.z);
    brush.rotation.z = Math.PI * 0.12;
    brush.castShadow = true;
    group.add(brush);
  });

  [
    { x: -0.52, z: 0, w: 0.035, d: 0.92 },
    { x: 0.08, z: 0, w: 0.035, d: 0.84 },
    { x: 0.52, z: 0, w: 0.035, d: 0.92 },
    { x: -0.2, z: -0.52, w: 0.58, d: 0.035 },
    { x: 0.28, z: -0.52, w: 0.42, d: 0.035 },
    { x: -0.2, z: 0.16, w: 0.54, d: 0.035 },
    { x: 0.3, z: 0.52, w: 0.4, d: 0.035 },
    { x: -0.28, z: 0.52, w: 0.44, d: 0.035 },
  ].forEach((item) => {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * item.w, 0.12, interiorDepth * item.d), trimMaterial);
    trim.position.set(center.x + item.x * interiorWidth, roomSurfaceY + 0.08, center.z + item.z * interiorDepth);
    trim.castShadow = true;
    group.add(trim);
  });

  [
    { x: 0.08, z: 0, w: 0.018, d: 0.92 },
    { x: -0.03, z: 0.16, w: 0.76, d: 0.018 },
    { x: 0.3, z: 0.02, w: 0.42, d: 0.018 },
  ].forEach((item) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(interiorWidth * item.w, 0.09, interiorDepth * item.d), boundaryMaterial);
    rail.position.set(center.x + item.x * interiorWidth, roomSurfaceY + 0.19, center.z + item.z * interiorDepth);
    rail.castShadow = true;
    group.add(rail);
  });

  [
    { x: -0.34, z: -0.34 },
    { x: 0.3, z: 0.28 },
  ].forEach((spot) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), lampMaterial);
    lamp.position.set(center.x + spot.x * interiorWidth, floorY + wallHeight + 0.12, center.z + spot.z * interiorDepth);
    group.add(lamp);

    const light = new THREE.PointLight('#ffd79a', 0, 4.8, 1.7);
    light.position.copy(lamp.position);
    group.add(light);
    group.userData.lights = group.userData.lights || [];
    group.userData.lights.push(light);
  });

  group.visible = false;

  return group;
}

function getRevealProgress(camera, controls) {
  const zoomProgress = THREE.MathUtils.clamp(
    (camera.zoom - INTERIOR_REVEAL_START) / (INTERIOR_REVEAL_END - INTERIOR_REVEAL_START),
    0,
    1,
  );
  const polarAngle = controls?.getPolarAngle?.() ?? Math.PI * 0.5;
  const roofAngleProgress = THREE.MathUtils.clamp(
    (ROOF_ENTRY_ANGLE_START - polarAngle) / (ROOF_ENTRY_ANGLE_START - ROOF_ENTRY_ANGLE_END),
    0,
    1,
  );

  const easedZoom = THREE.MathUtils.smoothstep(zoomProgress, 0, 1);
  return easedZoom * THREE.MathUtils.smoothstep(roofAngleProgress, 0, 1);
}

function applyInteriorReveal(progress, interior, exteriorMeshes, roofMeshes) {
  if (interior) {
    interior.visible = progress > 0.02;
    interior.userData.materials.forEach((material) => {
      material.opacity = progress * 0.98;
    });
    interior.userData.lights?.forEach((light) => {
      light.intensity = progress * 1.65;
    });
  }

  const showExterior = progress < EXTERIOR_HIDE_PROGRESS;
  exteriorMeshes.forEach((mesh) => {
    if (!mesh.material || !mesh.userData.originPosition) return;
    mesh.visible = showExterior;
    mesh.position.copy(mesh.userData.originPosition);

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      material.transparent = false;
      material.opacity = 1;
    });
  });

  roofMeshes.forEach((mesh) => {
    if (!mesh.material || !mesh.userData.originPosition) return;
    const roofLift = THREE.MathUtils.smoothstep(progress, 0.08, EXTERIOR_HIDE_PROGRESS);
    mesh.visible = showExterior;
    mesh.position.y = mesh.userData.originPosition.y + roofLift * 1.25;
  });
}

function frameModel(camera, controls, model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;

  controls.target.copy(center);
  controls.target.y = box.min.y + size.y * 0.38;
  camera.position.set(center.x, controls.target.y + size.y * 0.2, center.z + maxAxis * 2.2);
  camera.zoom = Math.min(1.22, Math.max(0.88, 7.2 / maxAxis));
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
}

export default function Scene() {
  const mountRef = useRef(null);
  const modelRef = useRef(null);
  const interiorRef = useRef(null);
  const exteriorMeshesRef = useRef([]);
  const roofMeshesRef = useRef([]);
  const revealProgressRef = useRef(0);
  const interiorModeRef = useRef(false);
  const exitInteriorRef = useRef(false);
  const hoveredRef = useRef(null);
  const selectedRef = useRef(null);
  const controlsRef = useRef(null);
  const componentsRef = useRef(new Map());
  const sensorDataRef = useRef(createMockSensorData());
  const [loading, setLoading] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [interiorMode, setInteriorMode] = useState(false);
  const [selected, setSelected] = useState(null);
  const [sensorSummary, setSensorSummary] = useState(() => summarizeSensorData(sensorDataRef.current));

  const selectedValues = useMemo(() => {
    if (!selected) return null;
    return sensorDataRef.current[selected.name] || {};
  }, [selected, sensorSummary]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#91b7cf');
    scene.fog = new THREE.FogExp2('#91b7cf', 0.026);

    const aspect = mount.clientWidth / mount.clientHeight;
    const camera = new THREE.OrthographicCamera(
      -CAMERA_SIZE * aspect,
      CAMERA_SIZE * aspect,
      CAMERA_SIZE,
      -CAMERA_SIZE,
      0.1,
      120,
    );
    camera.position.set(0, 2.1, 18);
    camera.zoom = DEFAULT_CAMERA_ZOOM;
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = createOrbitControls(camera, renderer.domElement);
    controls.autoRotate = autoRotate;
    controlsRef.current = controls;

    const ambient = new THREE.HemisphereLight('#f4fbff', '#70955c', 1.9);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight('#fff1c9', 2.1);
    sun.position.set(-5, 8, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 13;
    sun.shadow.camera.bottom = -13;
    scene.add(sun);

    const frontFill = new THREE.DirectionalLight('#f8fff0', 1.8);
    frontFill.position.set(0, 3.6, -8);
    scene.add(frontFill);

    const houseSetting = createHouseSetting();
    scene.add(houseSetting);

    const sensorContext = {
      applySensorData(sensorData, summary) {
        sensorDataRef.current = sensorData;
        componentsRef.current.forEach((mesh, name) => {
          applySensorVisual(mesh, sensorData[name] || {});
        });
        if (hoveredRef.current) setHoverState(hoveredRef.current, true);
        setSensorSummary(summary);
      },
    };
    setDigitalTwinContext(sensorContext);
    window.updateSensorData = updateSensorData;

    let rafId = 0;
    let disposed = false;

    loadBuildingModel({
      scene,
      onProgress: setLoading,
      onLoaded: (model, fallback) => {
        if (disposed) return;
        modelRef.current = model;
        exteriorMeshesRef.current = [];
        roofMeshesRef.current = [];
        componentsRef.current.clear();
        model.traverse((child) => {
          if (child.isMesh) {
            exteriorMeshesRef.current.push(child);
            componentsRef.current.set(child.name, child);
            child.userData.originPosition = child.position.clone();
            if (child.name.toLowerCase().includes('roof')) {
              roofMeshesRef.current.push(child);
            }
          }
        });
        const interior = createInteriorDetails(model);
        interiorRef.current = interior;
        scene.add(interior);
        setUsedFallback(fallback);
        setIsReady(true);
        frameModel(camera, controls, model);
        updateSensorData(sensorDataRef.current);
      },
    });

    function findInteractiveMesh(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...componentsRef.current.values()], false);
      return hits[0]?.object || null;
    }

    function onPointerMove(event) {
      const mesh = findInteractiveMesh(event);
      if (mesh === hoveredRef.current) return;
      if (hoveredRef.current && hoveredRef.current !== selectedRef.current) {
        setHoverState(hoveredRef.current, false);
      }
      hoveredRef.current = mesh;
      renderer.domElement.style.cursor = mesh ? 'pointer' : 'grab';
      if (mesh) setHoverState(mesh, true);
    }

    function onPointerDown() {
      renderer.domElement.style.cursor = 'grabbing';
    }

    function onPointerUp(event) {
      const mesh = findInteractiveMesh(event);
      selectedRef.current = mesh;
      setSelected(mesh ? { name: mesh.name } : null);
      renderer.domElement.style.cursor = mesh ? 'pointer' : 'grab';
    }

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    function resize() {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      const aspect = width / height;
      camera.left = -CAMERA_SIZE * aspect;
      camera.right = CAMERA_SIZE * aspect;
      camera.top = CAMERA_SIZE;
      camera.bottom = -CAMERA_SIZE;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    window.addEventListener('resize', resize);

    const clock = new THREE.Clock();
    function animate() {
      if (disposed) return;
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      if (modelRef.current) {
        const baseScale = modelRef.current.userData.baseScale || 1;
        const basePositionY = modelRef.current.userData.basePositionY || 0;
        const breath = 1 + Math.sin(elapsed * 1.15) * 0.004;
        modelRef.current.scale.setScalar(baseScale * breath);
        modelRef.current.position.y = basePositionY + Math.sin(elapsed * 1.2) * 0.018;
      }

      componentsRef.current.forEach((mesh) => {
        const origin = mesh.userData.originPosition;
        if (!origin) return;
        const shake = mesh.userData.sensorShake || 0;
        mesh.position.x = origin.x + Math.sin(elapsed * 36 + mesh.id) * 0.018 * shake;
        mesh.position.z = origin.z + Math.cos(elapsed * 31 + mesh.id) * 0.014 * shake;
      });

      houseSetting.userData.windTargets.forEach(({ object, amount, phase }) => {
        object.rotation.z = Math.sin(elapsed * 1.25 + phase) * amount;
      });

      controls.update();

      if (exitInteriorRef.current) {
        exitInteriorRef.current = false;
        interiorModeRef.current = false;
        setInteriorMode(false);
        camera.zoom = Math.min(camera.zoom, INTERIOR_REVEAL_START - 0.18);
        camera.updateProjectionMatrix();
      }

      const roofEntryProgress = getRevealProgress(camera, controls);
      if (!interiorModeRef.current && roofEntryProgress >= INTERIOR_LOCK_PROGRESS) {
        interiorModeRef.current = true;
        setInteriorMode(true);
      }

      revealProgressRef.current = THREE.MathUtils.damp(
        revealProgressRef.current,
        interiorModeRef.current ? 1 : roofEntryProgress,
        INTERIOR_REVEAL_SMOOTHING,
        delta,
      );
      applyInteriorReveal(
        revealProgressRef.current,
        interiorRef.current,
        exteriorMeshesRef.current,
        roofMeshesRef.current,
      );

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    }
    animate();

    const mockTimer = window.setInterval(() => {
      updateSensorData(createMockSensorData());
    }, 2200);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.clearInterval(mockTimer);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      clearDigitalTwinContext(sensorContext);
      if (window.updateSensorData === updateSensorData) delete window.updateSensorData;
      controls.dispose();
      disposeObject(houseSetting);
      if (interiorRef.current) disposeObject(interiorRef.current);
      interiorRef.current = null;
      exteriorMeshesRef.current = [];
      roofMeshesRef.current = [];
      revealProgressRef.current = 0;
      interiorModeRef.current = false;
      exitInteriorRef.current = false;
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  return (
    <main className="twin-shell">
      <div ref={mountRef} className="scene-mount" aria-label="3D structural digital twin viewport" />

      <section className="topbar" aria-label="Digital twin status">
        <div>
          <p className="eyebrow">Smart City Structural Twin</p>
          <h1>Live Building Health Monitor</h1>
        </div>
        <div className="topbar-actions">
          {interiorMode && (
            <button className="icon-button interior-exit-button" type="button" onClick={() => { exitInteriorRef.current = true; }}>
              <span className="btn-icon">✕</span>
              <span className="btn-label">Exit Interior</span>
            </button>
          )}
          <button className="icon-button" type="button" onClick={() => setAutoRotate((value) => !value)}>
            <span className="btn-icon">{autoRotate ? '⏸' : '↻'}</span>
            <span className="btn-label">{autoRotate ? 'Pause' : 'Auto Rotate'}</span>
          </button>
        </div>
      </section>

      <aside className="sensor-panel" aria-label="Live sensor values">
        <div className="panel-heading">
          <span>Live Sensors</span>
          <span className="pulse">Streaming</span>
        </div>
        <ul>
          {sensorSummary.map((item) => (
            <SensorRow key={item.componentName} item={item} />
          ))}
        </ul>
      </aside>

      {selected && (
        <aside className="selection-panel" aria-live="polite">
          <span className="selection-label">Selected Component</span>
          <strong>{formatComponentName(selected.name)}</strong>
          <span>
            {Object.entries(selectedValues || {})
              .map(([key, value]) => `${key}: ${value}`)
              .join(' / ') || 'No sensor feed assigned'}
          </span>
        </aside>
      )}

      {!isReady && (
        <div className="loader" role="status">
          <span>Loading building model</span>
          <div className="load-track">
            <span style={{ width: `${loading || 18}%` }} />
          </div>
        </div>
      )}

      {usedFallback && (
        <div className="fallback-note">
          Using procedural preview because <code>/building.glb</code> did not load.
        </div>
      )}
    </main>
  );
}
