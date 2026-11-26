import * as THREE from '../vendor/three.module.js';
import { SIZE, position, index, neighbours } from './world.js';
export class CityView {
  constructor(host, { onPick, onHover }) {
    this.host = host;
    this.onPick = onPick;
    this.onHover = onHover;
    this.angle = 0;
    this.zoom = 1;
    this.materials = new Map();
    this.geometry = new Map();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9eae3');
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D city; use the keyboard map for accessible editing',
    );
    this.scene.add(new THREE.HemisphereLight('#fff7e7', '#8faaa1', 2.1));
    const sun = new THREE.DirectionalLight('#fff7e2', 2.5);
    sun.position.set(-7, 15, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    const ground = this.box(100, 0.1, 100, '#e9eae3', 0, -0.55, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);
    const base = this.box(SIZE + 0.4, 0.42, SIZE + 0.4, '#d6cebb', 0, -0.24, 0);
    base.receiveShadow = true;
    this.scene.add(base);
    this.town = new THREE.Group();
    this.scene.add(this.town);
    this.people = new THREE.Group();
    this.scene.add(this.people);
    this.routes = new THREE.Group();
    this.scene.add(this.routes);
    this.cursor = this.box(0.99, 0.055, 0.99, '#ead369', 0, 0.12, 0);
    this.cursor.material = new THREE.MeshBasicMaterial({
      color: '#ead369',
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.agentMeshes = [];
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.renderer.domElement.addEventListener('pointermove', (event) => {
      const cell = this.cellAt(event);
      this.setCursor(cell);
      this.onHover(cell);
    });
    this.renderer.domElement.addEventListener('pointerleave', () => {
      this.setCursor(null);
      this.onHover(null);
    });
    this.renderer.domElement.addEventListener('click', (event) => {
      const cell = this.cellAt(event);
      if (cell !== null) this.onPick(cell);
    });
    this.resize();
  }
  material(colour) {
    if (!this.materials.has(colour))
      this.materials.set(colour, new THREE.MeshStandardMaterial({ color: colour, roughness: 1 }));
    return this.materials.get(colour);
  }
  mesh(geometry, colour, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, this.material(colour));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  shape(key, make) {
    if (!this.geometry.has(key)) this.geometry.set(key, make());
    return this.geometry.get(key);
  }
  box(w, h, d, colour, x = 0, y = 0, z = 0) {
    return this.mesh(
      this.shape(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
      colour,
      x,
      y,
      z,
    );
  }
  sphere(r, colour, x, y, z) {
    return this.mesh(
      this.shape(`s${r}`, () => new THREE.IcosahedronGeometry(r, 1)),
      colour,
      x,
      y,
      z,
    );
  }
  cylinder(r, h, colour, x, y, z) {
    return this.mesh(
      this.shape(`c${r},${h}`, () => new THREE.CylinderGeometry(r, r, h, 8)),
      colour,
      x,
      y,
      z,
    );
  }
  rebuild(tiles) {
    this.town.clear();
    this.tiles = tiles;
    for (let id = 0; id < tiles.length; id++) {
      const { x, y } = position(id),
        type = tiles[id],
        tile = new THREE.Group();
      tile.position.set(x - 5, 0, y - 5);
      this.town.add(tile);
      const lawn = ['#bfc9a0', '#c5ceaa', '#bec8a2'][(x * 3 + y) % 3];
      tile.add(
        this.box(
          0.98,
          0.12,
          0.98,
          type === 'road' ? '#747d83' : type === 'water' ? '#78bfc8' : lawn,
          0,
          0,
          0,
        ),
      );
      if (type === 'road') {
        const nearby = neighbours(id).filter((n) => tiles[n] === 'road');
        for (const next of nearby) {
          const p = position(next);
          tile.add(
            this.box(
              p.x !== x ? 0.25 : 0.025,
              0.008,
              p.y !== y ? 0.25 : 0.025,
              '#e7dfc6',
              (p.x - x) * 0.31,
              0.066,
              (p.y - y) * 0.31,
            ),
          );
        }
      }
      if (type === 'home') {
        tile.add(
          this.box(0.66, 0.64, 0.64, ['#e4ab8c', '#ecc3a4', '#e9b3a1'][(x + y) % 3], 0, 0.38, 0),
        );
        const roof = this.mesh(
          this.shape('roof', () => new THREE.ConeGeometry(0.55, 0.4, 4)),
          '#bd6b56',
          0,
          0.88,
          0,
        );
        roof.rotation.y = Math.PI / 4;
        tile.add(roof);
        tile.add(this.box(0.14, 0.3, 0.025, '#446065', 0.14, 0.23, 0.331));
        for (const a of [-0.19, 0.19])
          tile.add(this.box(0.12, 0.13, 0.025, '#fff0bc', a, 0.53, 0.331));
        tile.add(this.box(0.025, 0.14, 0.15, '#fff0bc', 0.341, 0.49, 0));
        tile.add(this.box(0.1, 0.25, 0.1, '#9b6755', -0.18, 0.95, -0.1));
        tile.add(this.box(0.2, 0.015, 0.15, '#eee6cd', 0.14, 0.075, 0.42));
      }
      if (type === 'studio') {
        tile.add(this.box(0.73, 1.55, 0.71, '#7897ab', 0, 0.83, 0));
        tile.add(this.box(0.81, 0.12, 0.79, '#d6dedb', 0, 1.65, 0));
        tile.add(this.box(0.3, 0.18, 0.27, '#90a5b0', 0.12, 1.78, -0.1));
        for (let floor = 0; floor < 3; floor++)
          for (const a of [-0.22, 0, 0.22]) {
            tile.add(this.box(0.13, 0.23, 0.025, '#d7eddf', a, 0.4 + floor * 0.39, 0.367));
            tile.add(this.box(0.025, 0.23, 0.13, '#c0d8d6', 0.377, 0.4 + floor * 0.39, a));
          }
        tile.add(this.box(0.19, 0.28, 0.025, '#354b5d', 0, 0.23, 0.37));
      }
      if (type === 'park') {
        for (const [a, b, s] of [
          [-0.18, 0.13, 1],
          [0.2, -0.16, 0.8],
        ]) {
          tile.add(this.cylinder(0.045, 0.4, '#896c4e', a, 0.24, b));
          tile.add(this.sphere(0.26 * s, '#6a9971', a, 0.62 * s, b));
          tile.add(this.sphere(0.2 * s, '#86b07c', a - 0.08, 0.78 * s, b + 0.02));
        }
        tile.add(this.box(0.32, 0.06, 0.12, '#a1855a', 0.12, 0.22, 0.31));
        for (const a of [0, 0.24]) tile.add(this.box(0.035, 0.16, 0.1, '#596b59', a, 0.12, 0.31));
      }
      if (type === 'block') {
        for (const a of [-0.27, 0.27]) tile.add(this.box(0.06, 0.4, 0.08, '#d27f51', a, 0.25, 0));
        tile.add(this.box(0.8, 0.19, 0.08, '#f0bb63', 0, 0.42, 0));
        for (const a of [-0.27, 0, 0.27]) {
          const stripe = this.box(0.1, 0.2, 0.086, '#f4edda', a, 0.42, 0);
          stripe.rotation.z = -0.25;
          tile.add(stripe);
        }
        tile.add(this.box(0.8, 0.045, 0.17, '#5e6259', 0, 0.09, 0));
      }
      if (type === 'water')
        for (let n = 0; n < 2; n++)
          tile.add(this.box(0.25, 0.008, 0.018, '#bce1db', n * 0.31 - 0.18, 0.066, n * 0.2 - 0.15));
      if (type === 'empty' && (x * 7 + y) % 11 === 0)
        tile.add(this.sphere(0.075, '#e9dbb1', -0.22, 0.11, 0.21));
    }
  }
  setCursor(id) {
    this.cursor.visible = id !== null;
    if (id !== null) {
      const { x, y } = position(id);
      this.cursor.position.set(x - 5, 0.1, y - 5);
    }
  }
  cellAt(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      ),
      this.camera,
    );
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return null;
    const x = Math.floor(this.hit.x + 5.5),
      y = Math.floor(this.hit.z + 5.5);
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE ? index(x, y) : null;
  }
  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    const aspect = width / height,
      h = Math.max(14.4, 17 / aspect) / this.zoom;
    this.camera.left = (-h * aspect) / 2;
    this.camera.right = (h * aspect) / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.position.set(
      Math.sin(Math.PI / 4 + this.angle) * 19,
      17,
      Math.cos(Math.PI / 4 + this.angle) * 19,
    );
    this.camera.lookAt(0, 0.25, 0);
    this.camera.updateProjectionMatrix();
  }
  rotate(delta) {
    this.angle += delta;
    this.resize();
  }
  changeZoom(delta) {
    this.zoom = Math.max(0.75, Math.min(1.5, this.zoom + delta));
    this.resize();
  }
  update(sim, time, rain = false) {
    while (this.agentMeshes.length < sim.agents.length) {
      const person = new THREE.Group();
      person.add(this.cylinder(0.055, 0.15, '#d9a44e', 0, 0.17, 0));
      person.add(this.sphere(0.055, '#594e43', 0, 0.3, 0));
      this.people.add(person);
      this.agentMeshes.push(person);
    }
    this.agentMeshes.forEach((mesh, i) => {
      const agent = sim.agents[i];
      mesh.visible = !!agent && !agent.done && agent.wait <= 0;
      if (!mesh.visible) return;
      const a = position(agent.cell),
        b = position(agent.path?.[1] ?? agent.cell),
        t = agent.progress;
      mesh.position.set(
        a.x + (b.x - a.x) * t - 5,
        0.04 + Math.abs(Math.sin(time * 9 + i)) * 0.015,
        a.y + (b.y - a.y) * t - 5,
      );
    });
    this.scene.background.set(rain ? '#cbd5d7' : '#e9eae3');
    this.renderer.render(this.scene, this.camera);
  }
  showRoutes(sim, enabled) {
    for (const child of this.routes.children) {
      child.geometry.dispose();
      child.material.dispose();
    }
    this.routes.clear();
    if (!enabled) return;
    const edges = new Set();
    const points = [];
    for (const agent of sim.agents)
      if (agent.path)
        for (let i = 1; i < agent.path.length; i++) {
          const a = agent.path[i - 1],
            b = agent.path[i],
            key = [a, b].sort((a, b) => a - b).join(':');
          if (edges.has(key)) continue;
          edges.add(key);
          for (const id of [a, b]) {
            const p = position(id);
            points.push(new THREE.Vector3(p.x - 5, 0.083, p.y - 5));
          }
        }
    if (points.length)
      this.routes.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: '#f9d96f', transparent: true, opacity: 0.85 }),
        ),
      );
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    for (const item of this.materials.values()) item.dispose();
    for (const item of this.geometry.values()) item.dispose();
  }
}
