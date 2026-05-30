import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createOrbitControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.autoRotateSpeed = -0.55;
  controls.minDistance = 3;
  controls.maxDistance = 58;
  controls.minZoom = 0.8;
  controls.maxZoom = 6;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, 2.65, 0);
  controls.update();

  return controls;
}
