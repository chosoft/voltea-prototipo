// Escena 3D del prototipo: un local de pyme visto en diorama.
// La energía sale del tablero (donde va el medidor) y viaja por los cables hasta cada equipo.
// Estados: "ambiente" → "medir" → "entender" → "ahorrar", controlados desde app.js con el scroll.
//
// Realismo: iluminación basada en imagen (RoomEnvironment), materiales físicos,
// bordes redondeados, sombras de contacto, bloom para lo que emite luz y ciclo de día.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const C = {
  piso: 0xdbe0d7, muroFondo: 0xe7eae3, muroLado: 0xdde2d9, tinta: 0x16211c, tablero: 0x23302a,
  blanco: 0xf7f8f5, gris: 0xb9c2bb, cable: 0x8f9a93, ambar: 0xf0a202, ahorro: 0x0b7a64, ahorroClaro: 0x3fc8a4,
  madera: 0xb08d63, acero: 0x9aa4a0
};

// Consumo por equipo: kW en operación, kW fuera de horario, pesos al mes (ilustrativo, suma ≈ $3,24 M).
const EQUIPOS = [
  { id: "frio",   nombre: "Nevera y vitrina", kwOn: 2.6, kwOff: 2.1, mes: 980000, modulo: true },
  { id: "aire",   nombre: "Aire del salón",   kwOn: 3.2, kwOff: 1.4, mes: 820000, modulo: true, fuga: true },
  { id: "horno",  nombre: "Horno",            kwOn: 2.4, kwOff: 0.0, mes: 640000, modulo: false },
  { id: "luces",  nombre: "Iluminación",      kwOn: 1.3, kwOff: 0.3, mes: 410000, modulo: true },
  { id: "equipos",nombre: "Caja y equipos",   kwOn: 0.8, kwOff: 0.35, mes: 390000, modulo: true }
];

/* ---------- Texturas dibujadas a mano (sin archivos externos) ---------- */
function lienzo(w, h, pintar) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  pintar(cv.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}
const texBaldosa = lienzo(512, 512, (g, w, h) => {
  g.fillStyle = "#dde2d8"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#c3cbc1"; g.lineWidth = 6;
  for (let i = 0; i <= 2; i++) { const p = (i * w) / 2; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${140 + Math.random() * 60},${145 + Math.random() * 60},${140 + Math.random() * 60},.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
texBaldosa.repeat.set(5, 4);
const texRugosidadPiso = lienzo(256, 256, (g, w, h) => {
  g.fillStyle = "#7a7a7a"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { const v = 90 + Math.random() * 80; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
});
texRugosidadPiso.repeat.set(5, 4);
const texMuro = lienzo(256, 256, (g, w, h) => {
  g.fillStyle = "#e8ebe4"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14000; i++) { const v = 225 + Math.random() * 30; g.fillStyle = `rgba(${v},${v},${v - 4},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
texMuro.repeat.set(3, 2);
const texMadera = lienzo(512, 256, (g, w, h) => {
  g.fillStyle = "#b08d63"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 40},${30 + Math.random() * 30},.22)`;
    g.lineWidth = 1 + Math.random() * 3;
    const y = Math.random() * h;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 3);
    g.stroke();
  }
});

/* ---------- Ayudas de geometría ---------- */
const cache = new Map();
function geoCaja(w, h, d, r = 0.02) {
  const clave = [w, h, d, r].join(",");
  if (!cache.has(clave)) cache.set(clave, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)));
  return cache.get(clave);
}
function caja(w, h, d, material, opts = {}) {
  const m = new THREE.Mesh(geoCaja(w, h, d, opts.radio ?? 0.02), material);
  m.castShadow = opts.sombra ?? true; m.receiveShadow = true;
  return m;
}
const matEstandar = (p) => new THREE.MeshStandardMaterial(p);
const matFisico = (p) => new THREE.MeshPhysicalMaterial(p);

// Sombra de contacto: una mancha suave bajo cada objeto, lo que más "asienta" un render.
const texMancha = lienzo(256, 256, (g, w, h) => {
  const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grad.addColorStop(0, "rgba(0,0,0,.55)"); grad.addColorStop(0.55, "rgba(0,0,0,.22)"); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
});
function mancha(x, z, ancho, fondo, opacidad = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(ancho, fondo),
    new THREE.MeshBasicMaterial({ map: texMancha, transparent: true, opacity: opacidad, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); m.renderOrder = 1;
  return m;
}

function etiqueta(texto, sub, color) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 176;
  const g = cv.getContext("2d");
  g.fillStyle = "rgba(18,28,24,0.94)";
  const r = 28; g.beginPath();
  g.moveTo(r, 0); g.arcTo(512, 0, 512, 176, r); g.arcTo(512, 176, 0, 176, r); g.arcTo(0, 176, 0, 0, r); g.arcTo(0, 0, 512, 0, r); g.fill();
  g.fillStyle = color; g.fillRect(28, 34, 10, 108);
  g.fillStyle = "#e9efe8"; g.font = "600 44px 'IBM Plex Mono', monospace"; g.fillText(texto, 60, 82);
  g.fillStyle = "#9fb0a6"; g.font = "500 32px 'Archivo', sans-serif"; g.fillText(sub, 60, 132);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(1.55, 0.53, 1); sp.renderOrder = 10;
  return sp;
}

export function crearEscena(contenedor, { alTick } = {}) {
  const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // En celulares y equipos modestos se bajan pasos costosos (bloom, vidrio con transmisión).
  const ligero = window.matchMedia("(max-width: 760px)").matches || (navigator.hardwareConcurrency || 8) <= 4;

  const renderer = new THREE.WebGLRenderer({ antialias: !ligero, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, ligero ? 1.6 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  contenedor.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // Fondo de estudio: degradado suave, igual al del contenedor en CSS.
  const texFondo = lienzo(8, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.55, "#eaefe7"); grad.addColorStop(1, "#dde4da");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  escena.background = texFondo;

  // Iluminación basada en imagen: da reflejos y rebotes a todos los materiales.
  const pmrem = new THREE.PMREMGenerator(renderer);
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  escena.environmentIntensity = 0.42;

  const hemi = new THREE.HemisphereLight(0xdfeaff, 0xbcc6bd, 0.5);
  escena.add(hemi);
  const sol = new THREE.DirectionalLight(0xfff0d8, 1.9);
  sol.position.set(-7, 8.5, 5); sol.castShadow = true;
  sol.shadow.mapSize.set(ligero ? 1024 : 2048, ligero ? 1024 : 2048);
  const sc = sol.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
  sol.shadow.radius = 3; sol.shadow.bias = -0.0006; sol.shadow.normalBias = 0.02;
  escena.add(sol);
  const relleno = new THREE.DirectionalLight(0xd9e6ff, 0.18);
  relleno.position.set(6, 4, 8); escena.add(relleno);

  const mundo = new THREE.Group(); escena.add(mundo);

  /* ---------- El local ---------- */
  const matPiso = matEstandar({ map: texBaldosa, roughnessMap: texRugosidadPiso, roughness: 0.58, metalness: 0.0, envMapIntensity: 0.6 });
  const piso = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 6), matPiso);
  piso.position.set(0, -0.15, 0); piso.receiveShadow = true; mundo.add(piso);

  const matMuro = matEstandar({ map: texMuro, color: C.muroFondo, roughness: 0.95, envMapIntensity: 0.6 });
  const fondo = caja(8, 3.3, 0.2, matMuro, { radio: 0.01 }); fondo.position.set(0, 1.65, -3.1); mundo.add(fondo);
  const lado = caja(0.2, 3.3, 6.2, matMuro.clone(), { radio: 0.01 }); lado.material.color.setHex(C.muroLado); lado.position.set(-4.1, 1.65, 0); mundo.add(lado);
  const zocalo = caja(8, 0.14, 0.06, matEstandar({ color: 0xdfe4dc, roughness: 0.6 }), { sombra: false, radio: 0.01 });
  zocalo.position.set(0, 0.07, -2.97); mundo.add(zocalo);

  // Ventana en el muro lateral: justifica de dónde entra la luz y da profundidad.
  const texVista = lienzo(256, 256, (g, w, h) => {
    const cielo = g.createLinearGradient(0, 0, 0, h);
    cielo.addColorStop(0, "#bcd9ef"); cielo.addColorStop(0.6, "#e4eff6"); cielo.addColorStop(1, "#dbe6dc");
    g.fillStyle = cielo; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(90,130,90,.5)";
    for (let i = 0; i < 26; i++) { const x = Math.random() * w, y = h * 0.62 + Math.random() * h * 0.38, r = 12 + Math.random() * 30; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "rgba(210,205,190,.55)"; g.fillRect(0, h * 0.78, w, h * 0.22);
  });
  const matVentana = new THREE.MeshBasicMaterial({ map: texVista, toneMapped: false });
  const ventana = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.35), matVentana);
  ventana.rotation.y = Math.PI / 2; ventana.position.set(-3.99, 1.95, 0.4); mundo.add(ventana);
  const matMarco = matEstandar({ color: 0x5c6660, roughness: 0.5, metalness: 0.35 });
  for (const [ah, al, y, z] of [[0.06, 1.45, 1.95, -0.68], [0.06, 1.45, 1.95, 1.48], [0.06, 0.06, 2.65, 0.4], [0.06, 0.06, 1.25, 0.4]]) {
    const barra = caja(0.07, al === 1.45 ? 1.45 : 0.06, al === 1.45 ? 0.06 : 2.2, matMarco, { sombra: false, radio: 0.01 });
    barra.position.set(-3.985, y, z); mundo.add(barra);
  }
  const parteluz = caja(0.07, 1.4, 0.05, matMarco, { sombra: false, radio: 0.01 });
  parteluz.position.set(-3.985, 1.95, 0.4); mundo.add(parteluz);

  /* ---------- Tablero y medidor ---------- */
  const matMetalPintado = matEstandar({ color: 0x7c847f, roughness: 0.4, metalness: 0.6, envMapIntensity: 1.3 });
  const matInteriorTablero = matEstandar({ color: 0x9aa39d, roughness: 0.5, metalness: 0.5 });
  const tablero = new THREE.Group(); tablero.position.set(-3.93, 1.75, -1.7); mundo.add(tablero);
  tablero.add(caja(0.16, 1.2, 0.86, matMetalPintado, { radio: 0.03 }));
  const puertaTablero = caja(0.05, 1.06, 0.74, matMetalPintado, { radio: 0.03 });
  puertaTablero.position.set(0.16, 0, -0.52); puertaTablero.rotation.y = 1.0; tablero.add(puertaTablero);
  const riel = caja(0.03, 0.64, 0.72, matInteriorTablero, { sombra: false, radio: 0.006 });
  riel.position.set(0.055, 0.12, 0); tablero.add(riel);
  const matBreaker = matEstandar({ color: 0x1b201e, roughness: 0.55, metalness: 0.1 });
  for (let i = 0; i < 8; i++) {
    const b = caja(0.05, 0.14, 0.07, matBreaker, { radio: 0.012 });
    b.position.set(0.09, 0.3 - Math.floor(i / 4) * 0.26, -0.24 + (i % 4) * 0.16);
    tablero.add(b);
  }
  const etiquetaTablero = caja(0.02, 0.16, 0.34, matEstandar({ color: 0xf3f5f0, roughness: 0.7 }), { sombra: false, radio: 0.01 });
  etiquetaTablero.position.set(0.085, 0.48, 0); tablero.add(etiquetaTablero);
  const medidor = new THREE.Group(); medidor.position.set(0.12, -0.32, 0); tablero.add(medidor);
  const matPlastico = matFisico({ color: C.blanco, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, envMapIntensity: 1.2 });
  medidor.add(caja(0.12, 0.3, 0.46, matPlastico, { radio: 0.035 }));
  const matLcd = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5fe0bb).multiplyScalar(1.5), toneMapped: false });
  const lcd = caja(0.02, 0.1, 0.3, matLcd, { sombra: false, radio: 0.008 });
  lcd.position.set(0.065, 0.04, 0); medidor.add(lcd);
  const matLed = new THREE.MeshBasicMaterial({ color: C.ambar, toneMapped: false });
  const led = caja(0.02, 0.035, 0.035, matLed, { sombra: false, radio: 0.006 });
  led.position.set(0.065, -0.08, 0.16); medidor.add(led);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 14), new THREE.MeshBasicMaterial({ color: C.ahorroClaro, transparent: true, opacity: 0, depthWrite: false }));
  halo.position.copy(tablero.position).add(new THREE.Vector3(0.12, -0.32, 0)); mundo.add(halo);

  /* ---------- Equipos ---------- */
  const nodos = {};
  // Nevera / vitrina
  {
    const g = new THREE.Group(); g.position.set(2.95, 0, -2.45);
    const matCarcasa = matFisico({ color: C.blanco, roughness: 0.3, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 1.2 });
    // Carcasa hueca: trasera, costados, techo y piso (si fuera maciza taparía las botellas)
    for (const [w2, h2, d2, x2, y2, z2] of [
      [1.05, 1.8, 0.06, 0, 1.15, -0.37],
      [0.06, 1.8, 0.8, -0.5, 1.15, 0],
      [0.06, 1.8, 0.8, 0.5, 1.15, 0],
      [1.05, 0.07, 0.8, 0, 2.02, 0],
      [1.05, 0.07, 0.8, 0, 0.3, 0]
    ]) {
      const panel = caja(w2, h2, d2, matCarcasa, { radio: 0.03 });
      panel.position.set(x2, y2, z2); g.add(panel);
    }
    const matVidrio = ligero
      ? matFisico({ color: 0xdff0f4, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.35, envMapIntensity: 2 })
      : matFisico({ color: 0xeaf7fa, roughness: 0.05, metalness: 0, transmission: 0.92, thickness: 0.4, ior: 1.45, envMapIntensity: 1.6 });
    const vidrio = caja(0.9, 1.45, 0.03, matVidrio, { sombra: false, radio: 0.01 });
    vidrio.position.set(0, 1.22, 0.4); g.add(vidrio);
    const matMarcoP = matEstandar({ color: 0x2a332f, roughness: 0.4, metalness: 0.6, envMapIntensity: 1.3 });
    for (const [w2, h2, dx, dy] of [[0.96, 0.06, 0, 0.75], [0.96, 0.06, 0, -0.75], [0.06, 1.56, -0.45, 0], [0.06, 1.56, 0.45, 0]]) {
      const barra = caja(w2, h2, 0.06, matMarcoP, { radio: 0.015 });
      barra.position.set(dx, 1.22 + dy, 0.4); g.add(barra);
    }
    const manija = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 10), matEstandar({ color: 0xa9b2ae, roughness: 0.25, metalness: 0.95, envMapIntensity: 1.8 }));
    manija.position.set(0.38, 1.22, 0.46); manija.castShadow = true; g.add(manija);
    const matRepisa = matEstandar({ color: 0xd8e0e2, roughness: 0.35, metalness: 0.5 });
    const colores = [0xb8422f, 0x2f6cb0, 0xd1962a, 0x3f8a58, 0xc3bdac];
    for (let i = 0; i < 3; i++) {
      const r = caja(0.86, 0.03, 0.6, matRepisa, { sombra: false, radio: 0.005 });
      r.position.set(0, 0.65 + i * 0.42, 0.05); g.add(r);
      for (let j = 0; j < 5; j++) {
        const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.26, 12), matEstandar({ color: colores[(i + j) % colores.length], roughness: 0.25, metalness: 0.05, envMapIntensity: 1.4 }));
        bot.position.set(-0.32 + j * 0.16, 0.8 + i * 0.42, 0.05); bot.castShadow = true; g.add(bot);
      }
    }
    const base = caja(1.0, 0.24, 0.76, matEstandar({ color: 0x1d2522, roughness: 0.6, metalness: 0.3 }), { radio: 0.02 });
    base.position.y = 0.12; g.add(base);
    const luzFrio = new THREE.PointLight(0xdcf0ff, 5, 2.6, 2);
    luzFrio.position.set(2.95, 1.45, -2.25); g.add(luzFrio);
    mundo.add(g); mundo.add(mancha(2.95, -2.4, 2.1, 1.9));
    nodos.frio = { grupo: g, punto: new THREE.Vector3(2.95, 2.1, -2.45), luz: luzFrio };
  }
  // Aire acondicionado en el muro
  {
    const g = new THREE.Group(); g.position.set(-1.1, 2.55, -2.86);
    const matAire = matFisico({ color: C.blanco, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.2 });
    const cuerpo = caja(1.5, 0.46, 0.3, matAire, { radio: 0.09 }); g.add(cuerpo);
    const rejilla = caja(1.3, 0.06, 0.03, matEstandar({ color: 0xc8cec9, roughness: 0.5 }), { sombra: false, radio: 0.01 });
    rejilla.position.set(0, -0.15, 0.15); rejilla.rotation.x = 0.35; g.add(rejilla);
    const luzA = caja(0.05, 0.025, 0.02, new THREE.MeshBasicMaterial({ color: C.ahorroClaro, toneMapped: false }), { sombra: false, radio: 0.004 });
    luzA.position.set(0.6, 0.1, 0.16); g.add(luzA);
    mundo.add(g);
    nodos.aire = { grupo: g, punto: new THREE.Vector3(-1.1, 2.8, -2.86), brisa: [] };
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.12, 0.012, 6, 40, Math.PI * 0.6), new THREE.MeshBasicMaterial({ color: 0x9fd9e6, transparent: true, opacity: 0 }));
      b.rotation.set(Math.PI / 2, 0, Math.PI * 0.2); b.position.set(-1.1, 2.2 - i * 0.12, -2.4 + i * 0.25);
      mundo.add(b); nodos.aire.brisa.push(b);
    }
  }
  // Horno
  {
    const g = new THREE.Group(); g.position.set(0.9, 0, -2.5);
    const cuerpo = caja(1.25, 0.95, 0.8, matEstandar({ color: 0x2b3833, roughness: 0.38, metalness: 0.65, envMapIntensity: 1.2 }), { radio: 0.05 });
    cuerpo.position.y = 0.475; g.add(cuerpo);
    const puerta = caja(0.92, 0.46, 0.04, new THREE.MeshBasicMaterial({ color: 0x140d07, toneMapped: false }), { sombra: false, radio: 0.02 });
    puerta.position.set(0, 0.5, 0.4); g.add(puerta);
    const manija = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 12), matEstandar({ color: C.acero, roughness: 0.25, metalness: 0.95, envMapIntensity: 1.6 }));
    manija.rotation.z = Math.PI / 2; manija.position.set(0, 0.78, 0.44); manija.castShadow = true; g.add(manija);
    const top = caja(1.28, 0.05, 0.82, matEstandar({ color: 0x78827d, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.8 }), { radio: 0.012 });
    top.position.y = 0.975; g.add(top);
    mundo.add(g); mundo.add(mancha(0.9, -2.45, 2.1, 1.7, 0.9));
    nodos.horno = { grupo: g, punto: new THREE.Vector3(0.9, 1.0, -2.5), puerta: puerta.material };
  }
  // Mostrador con caja registradora
  {
    const g = new THREE.Group(); g.position.set(0.1, 0, 0.9);
    const m = caja(2.6, 1.0, 0.75, matEstandar({ map: texMadera, roughness: 0.55, envMapIntensity: 0.8 }), { radio: 0.03 });
    m.position.y = 0.5; g.add(m);
    const tapa = caja(2.72, 0.06, 0.86, matEstandar({ color: 0x1b211e, roughness: 0.25, metalness: 0.3, envMapIntensity: 1.3 }), { radio: 0.012 });
    tapa.position.y = 1.03; g.add(tapa);
    const pantalla = caja(0.52, 0.36, 0.035, matEstandar({ color: 0x141a18, roughness: 0.4, metalness: 0.3 }), { radio: 0.015 });
    pantalla.position.set(0.6, 1.33, -0.1); pantalla.rotation.x = -0.18; g.add(pantalla);
    const brillo = caja(0.46, 0.3, 0.01, new THREE.MeshBasicMaterial({ color: 0x7fd8bd, toneMapped: false }), { sombra: false, radio: 0.004 });
    brillo.position.set(0.6, 1.33, -0.072); brillo.rotation.x = -0.18; g.add(brillo);
    const pie = caja(0.07, 0.22, 0.07, matEstandar({ color: 0x141a18, roughness: 0.4, metalness: 0.4 }), { radio: 0.01 });
    pie.position.set(0.6, 1.12, -0.12); g.add(pie);
    mundo.add(g); mundo.add(mancha(0.1, 0.95, 3.6, 1.7, 0.85));
    nodos.equipos = { grupo: g, punto: new THREE.Vector3(0.7, 1.05, 0.8), pantalla: brillo.material };
  }
  // Lámparas colgantes, con luz propia
  {
    const bombillos = [], luces = [];
    const matCordon = matEstandar({ color: 0x1b211e, roughness: 0.8 });
    const matPantalla = matEstandar({ color: 0x1d2724, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide, envMapIntensity: 1.4 });
    const matInterior = matEstandar({ color: 0xfff3d6, roughness: 0.6, side: THREE.BackSide, emissive: 0xffd9a0, emissiveIntensity: 0.4 });
    [-1.6, 0.4, 2.2].forEach((x) => {
      const cordon = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 6), matCordon);
      cordon.position.set(x, 3.0, 0.1); mundo.add(cordon);
      const pantalla = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 28, 1, true), matPantalla);
      pantalla.position.set(x, 2.62, 0.1); pantalla.castShadow = true; mundo.add(pantalla);
      const interior = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.28, 24, 1, true), matInterior);
      interior.position.set(x, 2.62, 0.1); mundo.add(interior);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false }));
      b.position.set(x, 2.5, 0.1); mundo.add(b); bombillos.push(b);
      const luz = new THREE.PointLight(0xffd9a0, 13, 8, 2);
      luz.position.set(x, 2.45, 0.1); mundo.add(luz); luces.push(luz);
    });
    nodos.luces = { punto: new THREE.Vector3(0.4, 2.7, 0.1), bombillos, luces };
  }

  // Utilería: cajas apiladas y una matera, para que el local no se vea vacío
  {
    const matCarton = matEstandar({ color: 0xb98f5e, roughness: 0.85 });
    const matCaja2 = matEstandar({ color: 0x8fa08d, roughness: 0.8 });
    const apilado = [[-2.9, 0.22, 1.6, 0.44, matCarton], [-2.9, 0.62, 1.58, 0.4, matCaja2], [-2.42, 0.2, 1.75, 0.4, matCaja2]];
    for (const [x, y, z, alto, mat] of apilado) {
      const c = caja(0.5, alto, 0.42, mat, { radio: 0.015 });
      c.position.set(x, y, z); c.rotation.y = (Math.random() - 0.5) * 0.3; mundo.add(c);
    }
    mundo.add(mancha(-2.7, 1.7, 1.9, 1.3, 0.8));
    const matera = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 20), matEstandar({ color: 0xc08a63, roughness: 0.8 }));
    matera.position.set(-3.4, 0.15, -0.9); matera.castShadow = true; mundo.add(matera);
    const matHoja = matEstandar({ color: 0x3f7a4a, roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const hoja = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), matHoja);
      hoja.position.set(-3.4 + Math.cos(i * 1.8) * 0.16, 0.42 + i * 0.045, -0.9 + Math.sin(i * 1.8) * 0.16);
      hoja.scale.set(1, 0.55, 1); hoja.castShadow = true; mundo.add(hoja);
    }
    mundo.add(mancha(-3.4, -0.9, 0.9, 0.9, 0.7));
  }

  /* ---------- Cables ---------- */
  const origen = tablero.position.clone().add(new THREE.Vector3(0.1, 0.55, 0));
  const rutas = {};
  const matCable = matEstandar({ color: C.cable, roughness: 0.75, metalness: 0.05 });
  function ruta(id, destino, via) {
    const pts = [origen.clone(), new THREE.Vector3(origen.x + 0.05, 3.15, origen.z), ...via, destino.clone()];
    const curva = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.2);
    const tubo = new THREE.Mesh(new THREE.TubeGeometry(curva, 90, 0.022, 8, false), matCable);
    tubo.castShadow = true; mundo.add(tubo); rutas[id] = curva;
  }
  ruta("frio",   nodos.frio.punto,   [new THREE.Vector3(-2.0, 3.15, -2.85), new THREE.Vector3(2.95, 3.15, -2.85), new THREE.Vector3(2.95, 2.4, -2.6)]);
  ruta("aire",   nodos.aire.punto,   [new THREE.Vector3(-2.6, 3.15, -2.9), new THREE.Vector3(-1.1, 3.1, -2.9)]);
  ruta("horno",  nodos.horno.punto,  [new THREE.Vector3(-2.2, 3.12, -2.95), new THREE.Vector3(0.9, 3.12, -2.95), new THREE.Vector3(0.9, 1.4, -2.95)]);
  ruta("luces",  nodos.luces.punto,  [new THREE.Vector3(-2.6, 3.2, -0.6), new THREE.Vector3(-1.6, 3.25, 0.1), new THREE.Vector3(0.4, 3.25, 0.1)]);
  ruta("equipos",nodos.equipos.punto,[new THREE.Vector3(-3.9, 3.1, 0.4), new THREE.Vector3(-3.9, 0.3, 0.9), new THREE.Vector3(-1.0, 0.25, 0.95)]);

  // Partículas de energía: una malla instanciada por ruta. Con bloom se ven como luz.
  const POR_RUTA = 26;
  const geoP = new THREE.SphereGeometry(0.034, 12, 10);
  const flujos = {};
  for (const e of EQUIPOS) {
    const mat = new THREE.MeshBasicMaterial({ color: C.ambar, toneMapped: false });
    const inst = new THREE.InstancedMesh(geoP, mat, POR_RUTA);
    inst.frustumCulled = false;
    mundo.add(inst);
    flujos[e.id] = { inst, mat, fases: Array.from({ length: POR_RUTA }, (_, i) => i / POR_RUTA), color: new THREE.Color(C.ambar) };
  }

  /* ---------- Etiquetas y anillos de módulo ---------- */
  const etiquetas = {}, anillos = {};
  const posEtiq = { frio: [2.95, 2.55, -2.2], aire: [-1.1, 3.25, -2.6], horno: [0.9, 1.5, -2.2], luces: [-1.6, 2.1, 0.4], equipos: [0.7, 1.8, 1.1] };
  for (const e of EQUIPOS) {
    const hex = e.fuga ? "#f0a202" : "#e9efe8";
    const sp = etiqueta("$" + e.mes.toLocaleString("es-CO"), e.fuga ? "Aire · prendido de noche" : e.nombre + " · al mes", hex);
    sp.position.set(...posEtiq[e.id]); sp.material.opacity = 0; mundo.add(sp); etiquetas[e.id] = sp;
    if (e.modulo) {
      const a = new THREE.Mesh(
        new THREE.TorusGeometry(0.46, 0.055, 16, 64),
        matEstandar({ color: C.ahorro, roughness: 0.25, metalness: 0.4, emissive: C.ahorroClaro, emissiveIntensity: 0.7, envMapIntensity: 1.4 })
      );
      const p = (e.id === "luces" ? nodos.luces.punto : nodos[e.id].punto).clone();
      a.position.set(p.x, p.y + 0.18, p.z + 0.2); a.rotation.x = Math.PI / 2; a.scale.setScalar(0.001);
      a.castShadow = false; mundo.add(a); anillos[e.id] = a;
    }
  }

  /* ---------- Post-proceso ---------- */
  let composer = null, bloom = null;
  if (!ligero) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(escena, camara));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.5, 0.98);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /* ---------- Estados de cámara ---------- */
  const ESTADOS = {
    ambiente: { cam: new THREE.Vector3(9.2, 6.4, 10.2), mira: new THREE.Vector3(0, 1.1, -0.6) },
    medir:    { cam: new THREE.Vector3(-0.4, 1.95, 2.5), mira: new THREE.Vector3(-3.75, 1.7, -1.72) },
    entender: { cam: new THREE.Vector3(7.8, 5.6, 9.0),  mira: new THREE.Vector3(0, 1.4, -1.0) },
    ahorrar:  { cam: new THREE.Vector3(5.6, 7.4, 9.6),  mira: new THREE.Vector3(-0.2, 1.5, -1.3) }
  };
  let estado = "ambiente";
  const camPos = ESTADOS.ambiente.cam.clone(), camMira = ESTADOS.ambiente.mira.clone();
  camara.position.copy(camPos);
  const puntero = new THREE.Vector2();
  let modulosActivos = new Set(["aire", "frio", "luces"]);

  // Ciclo de un día simulado: 24 h en ~26 s. La operación va de 7 a 20.
  let hora = 9.0;
  const abierto = (h) => h >= 7 && h < 20;
  const mix = { medir: 0, entender: 0, ahorrar: 0 };
  const colFondoDia = new THREE.Color(0xffffff), colFondoNoche = new THREE.Color(0x8e9aa4);

  function kwEquipo(e, h) {
    let kw = abierto(h) ? e.kwOn : e.kwOff;
    if (e.id === "horno" && abierto(h)) kw *= (h > 10 && h < 14) ? 1.2 : 0.5;
    if (mix.ahorrar > 0.01 && modulosActivos.has(e.id)) {
      const recorte = e.fuga && !abierto(h) ? 0.95 : 0.3;
      kw *= 1 - recorte * mix.ahorrar;
    }
    return kw;
  }

  function redimensionar() {
    const { width, height } = contenedor.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    bloom?.setSize(width, height);
    camara.aspect = width / height;
    // En pantallas angostas alejamos la cámara para que el local quepa completo.
    camara.fov = width / height < 0.9 ? 44 : 32;
    camara.updateProjectionMatrix();
  }
  new ResizeObserver(redimensionar).observe(contenedor); redimensionar();

  contenedor.addEventListener("pointermove", (ev) => {
    const r = contenedor.getBoundingClientRect();
    puntero.set(((ev.clientX - r.left) / r.width) * 2 - 1, ((ev.clientY - r.top) / r.height) * 2 - 1);
  });
  contenedor.addEventListener("pointerleave", () => puntero.set(0, 0));

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0 }).observe(contenedor);

  const reloj = new THREE.Clock();
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const colAmbar = new THREE.Color(C.ambar), colAhorro = new THREE.Color(C.ahorroClaro), colLedBase = new THREE.Color(C.ambar);
  let ultimoTick = 0;

  function cuadro() {
    requestAnimationFrame(cuadro);
    if (!visible) { reloj.getDelta(); return; }
    const dt = Math.min(reloj.getDelta(), 0.05);
    const t = reloj.elapsedTime;
    hora = (hora + dt * (reducir ? 0.25 : 0.92)) % 24;

    // Mezclas suaves entre estados
    for (const k of Object.keys(mix)) {
      const meta = estado === k || (k === "entender" && estado === "ahorrar") ? 1 : 0;
      mix[k] += (meta - mix[k]) * Math.min(1, dt * 3);
    }

    // Luz del día: amanece hacia las 6:30 y anochece hacia las 18:30.
    const dia = THREE.MathUtils.smoothstep(hora, 5.5, 7.5) * (1 - THREE.MathUtils.smoothstep(hora, 17.5, 19.5));
    sol.intensity = 0.12 + 1.9 * dia;
    hemi.intensity = 0.16 + 0.5 * dia;
    escena.environmentIntensity = 0.14 + 0.32 * dia;
    matVentana.color.setRGB(0.99 * (0.25 + 0.75 * dia), 0.97 * (0.22 + 0.78 * dia), 0.91 * (0.3 + 0.7 * dia));
    renderer.toneMappingExposure = 0.58 + 0.28 * dia;

    // Cámara
    const obj = ESTADOS[estado];
    camPos.lerp(obj.cam, Math.min(1, dt * 1.6)); camMira.lerp(obj.mira, Math.min(1, dt * 1.6));
    const orbita = reducir ? 0 : Math.sin(t * 0.18) * 0.35;
    camara.position.set(camPos.x + orbita + puntero.x * 0.6, camPos.y - puntero.y * 0.35, camPos.z - orbita * 0.5);
    camara.lookAt(camMira);

    // Partículas por ruta
    let kwTotal = 0;
    for (const e of EQUIPOS) {
      const kw = kwEquipo(e, hora); kwTotal += kw;
      const f = flujos[e.id], curva = rutas[e.id];
      const velocidad = 0.05 + kw * 0.055;
      const verde = mix.ahorrar * (modulosActivos.has(e.id) ? 1 : 0);
      f.color.copy(colAmbar).lerp(colAhorro, verde); f.mat.color.copy(f.color);
      const activos = Math.max(2, Math.round(POR_RUTA * Math.min(1, kw / 3.2)));
      for (let i = 0; i < POR_RUTA; i++) {
        f.fases[i] = (f.fases[i] + dt * velocidad * (reducir ? 0.3 : 1)) % 1;
        curva.getPointAt(f.fases[i], v);
        const tam = i < activos ? 1 : 0.0001;
        s.setScalar(tam * (0.75 + 0.35 * Math.sin(f.fases[i] * Math.PI)));
        m4.compose(v, q, s); f.inst.setMatrixAt(i, m4);
      }
      f.inst.instanceMatrix.needsUpdate = true;

      // Etiquetas y anillos
      const et = etiquetas[e.id];
      et.material.opacity += ((mix.entender > 0.5 && estado !== "ahorrar" ? 1 : 0) - et.material.opacity) * Math.min(1, dt * 4);
      et.position.y = posEtiq[e.id][1] + Math.sin(t * 1.3 + posEtiq[e.id][0]) * 0.04;
      const a = anillos[e.id];
      if (a) {
        const meta = mix.ahorrar > 0.5 && modulosActivos.has(e.id) ? 1 : 0.001;
        a.scale.setScalar(a.scale.x + (meta - a.scale.x) * Math.min(1, dt * 5));
        a.position.y += Math.sin(t * 2 + a.position.x) * 0.002;
      }
    }

    // Detalles vivos
    const abiertoAhora = abierto(hora);
    matLed.color.copy(colLedBase).multiplyScalar(0.9 + Math.max(0, Math.sin(t * (2 + kwTotal))) * 1.5);
    halo.material.opacity = mix.medir * (0.1 + Math.sin(t * 3) * 0.035);
    halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    const encendidas = abiertoAhora || !(modulosActivos.has("luces") && mix.ahorrar > 0.5);
    nodos.luces.luces.forEach((l) => { l.intensity += ((encendidas ? (abiertoAhora ? 14 : 9) : 0.6) - l.intensity) * dt * 3; });
    nodos.luces.bombillos.forEach((b, i) => {
      const meta = encendidas ? (abiertoAhora ? 1 : 0.45) : 0.06;
      b.material.color.setHex(0xffe6b0).multiplyScalar(meta * 1.9 * (1 + Math.sin(t * 6 + i) * 0.01));
    });
    nodos.horno.puerta.color.setRGB(abiertoAhora ? 0.55 + Math.sin(t * 2) * 0.12 : 0.07, abiertoAhora ? 0.22 : 0.05, 0.04);
    nodos.equipos.pantalla.color.setHex(abiertoAhora ? 0x7fd8bd : 0x24463c);
    const aireKw = kwEquipo(EQUIPOS[1], hora);
    nodos.aire.brisa.forEach((b, i) => { b.material.opacity = Math.min(0.5, aireKw / 6) * (0.5 + 0.5 * Math.sin(t * 2.4 - i)); });
    if (bloom) bloom.strength = 0.22 + 0.3 * (1 - dia);

    if (composer) composer.render(); else renderer.render(escena, camara);

    if (alTick && t - ultimoTick > 0.12) {
      ultimoTick = t;
      alTick({ hora, kw: kwTotal, costoHora: kwTotal * (window.VOLTEA_CONFIG?.tarifaKwh ?? 800), abierto: abiertoAhora, estado });
    }
  }
  cuadro();

  return {
    ponerEstado(nuevo) { if (ESTADOS[nuevo]) estado = nuevo; },
    ponerModulos(ids) { modulosActivos = new Set(ids); }
  };
}
