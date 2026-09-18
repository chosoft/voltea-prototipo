// Escena 3D del prototipo: un local de pyme visto en diorama.
// La energía sale del tablero (donde va el medidor) y viaja por los cables hasta cada equipo.
// Estados: "ambiente" → "medir" → "entender" → "ahorrar", controlados desde app.js con el scroll.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";

const C = {
  piso: 0xe3e8df, muroFondo: 0xf7f8f4, muroLado: 0xeaeee6, tinta: 0x16211c, tablero: 0x1c2a24,
  blanco: 0xfbfcf9, gris: 0xb9c2bb, cable: 0x9aa59d, ambar: 0xf0a202, ahorro: 0x0b7a64, ahorroClaro: 0x3fc8a4,
  madera: 0xc9b79a
};

// Consumo por equipo: kW en operación, kW fuera de horario, pesos al mes (ilustrativo, suma ≈ $3,24 M).
const EQUIPOS = [
  { id: "frio",   nombre: "Nevera y vitrina", kwOn: 2.6, kwOff: 2.1, mes: 980000, modulo: true },
  { id: "aire",   nombre: "Aire del salón",   kwOn: 3.2, kwOff: 1.4, mes: 820000, modulo: true, fuga: true },
  { id: "horno",  nombre: "Horno",            kwOn: 2.4, kwOff: 0.0, mes: 640000, modulo: false },
  { id: "luces",  nombre: "Iluminación",      kwOn: 1.3, kwOff: 0.3, mes: 410000, modulo: true },
  { id: "equipos",nombre: "Caja y equipos",   kwOn: 0.8, kwOff: 0.35, mes: 390000, modulo: true }
];

function etiqueta(texto, sub, color) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 176;
  const g = cv.getContext("2d");
  g.fillStyle = "rgba(22,33,28,0.92)";
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

function caja(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.72, metalness: opts.metal ?? 0.02, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 0 })
  );
  m.castShadow = opts.sombra ?? true; m.receiveShadow = true;
  return m;
}

export function crearEscena(contenedor, { alTick } = {}) {
  const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  contenedor.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // Luz
  escena.add(new THREE.HemisphereLight(0xffffff, 0xcfd8cf, 1.25));
  const sol = new THREE.DirectionalLight(0xfff4e0, 2.1);
  sol.position.set(6, 10, 7); sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024); sol.shadow.camera.left = -8; sol.shadow.camera.right = 8; sol.shadow.camera.top = 8; sol.shadow.camera.bottom = -8;
  sol.shadow.radius = 5; sol.shadow.bias = -0.0008;
  escena.add(sol);

  const mundo = new THREE.Group(); escena.add(mundo);

  // Local: piso y dos muros
  const piso = caja(8, 0.3, 6, C.piso, { sombra: false }); piso.position.set(0, -0.15, 0); mundo.add(piso);
  const baldosas = new THREE.GridHelper(8, 16, 0xcfd6cc, 0xd6ddd3); baldosas.position.y = 0.005; baldosas.scale.z = 6 / 8; mundo.add(baldosas);
  const fondo = caja(8, 3.3, 0.2, C.muroFondo); fondo.position.set(0, 1.65, -3.1); mundo.add(fondo);
  const lado = caja(0.2, 3.3, 6.2, C.muroLado); lado.position.set(-4.1, 1.65, 0); mundo.add(lado);
  const zocalo = caja(8, 0.12, 0.05, C.gris, { sombra: false }); zocalo.position.set(0, 0.06, -2.98); mundo.add(zocalo);

  // Tablero eléctrico y medidor
  const tablero = new THREE.Group(); tablero.position.set(-3.93, 1.75, -1.7); mundo.add(tablero);
  tablero.add(caja(0.14, 1.1, 0.78, C.tablero, { rough: 0.5, metal: 0.3 }));
  for (let i = 0; i < 6; i++) { const b = caja(0.05, 0.16, 0.08, 0xdfe5de); b.position.set(0.09, 0.28 - Math.floor(i / 3) * 0.3, -0.22 + (i % 3) * 0.22); tablero.add(b); }
  const medidor = new THREE.Group(); medidor.position.set(0.12, -0.3, 0); tablero.add(medidor);
  medidor.add(caja(0.12, 0.3, 0.46, C.blanco, { rough: 0.4 }));
  const lcd = caja(0.02, 0.1, 0.3, 0x0b7a64, { emissive: 0x3fc8a4, ei: 0.9, sombra: false }); lcd.position.set(0.07, 0.04, 0); medidor.add(lcd);
  const led = caja(0.02, 0.04, 0.04, C.ambar, { emissive: C.ambar, ei: 2, sombra: false }); led.position.set(0.07, -0.08, 0.16); medidor.add(led);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16), new THREE.MeshBasicMaterial({ color: C.ahorroClaro, transparent: true, opacity: 0, depthWrite: false }));
  halo.position.copy(tablero.position).add(new THREE.Vector3(0.12, -0.3, 0)); mundo.add(halo);

  // Equipos
  const nodos = {};
  // Nevera / vitrina
  { const g = new THREE.Group(); g.position.set(2.95, 0, -2.45);
    const cuerpo = caja(1.05, 1.8, 0.8, C.blanco, { rough: 0.35 }); cuerpo.position.y = 1.15; g.add(cuerpo);
    const vidrio = caja(0.9, 1.5, 0.02, 0xbfe3ec, { rough: 0.1, metal: 0.1, emissive: 0x9fd9e6, ei: 0.35, sombra: false }); vidrio.position.set(0, 1.2, 0.41); g.add(vidrio);
    for (let i = 0; i < 3; i++) { const r = caja(0.86, 0.03, 0.6, 0xe7ecef); r.position.set(0, 0.7 + i * 0.42, 0.02); g.add(r); }
    const base = caja(1.0, 0.24, 0.76, C.tinta); base.position.y = 0.12; g.add(base);
    mundo.add(g); nodos.frio = { grupo: g, punto: new THREE.Vector3(2.95, 2.1, -2.45) }; }
  // Aire acondicionado en el muro
  { const g = new THREE.Group(); g.position.set(-1.1, 2.55, -2.86);
    const cuerpo = caja(1.5, 0.46, 0.3, C.blanco, { rough: 0.3 }); g.add(cuerpo);
    const rejilla = caja(1.3, 0.05, 0.02, C.gris, { sombra: false }); rejilla.position.set(0, -0.14, 0.16); g.add(rejilla);
    const luzA = caja(0.06, 0.03, 0.02, C.ahorroClaro, { emissive: C.ahorroClaro, ei: 2, sombra: false }); luzA.position.set(0.6, 0.1, 0.16); g.add(luzA);
    mundo.add(g); nodos.aire = { grupo: g, punto: new THREE.Vector3(-1.1, 2.8, -2.86), brisa: [] };
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.12, 0.012, 6, 40, Math.PI * 0.6), new THREE.MeshBasicMaterial({ color: 0x9fd9e6, transparent: true, opacity: 0.0 }));
      b.rotation.set(Math.PI / 2, 0, Math.PI * 0.2); b.position.set(-1.1, 2.2 - i * 0.12, -2.4 + i * 0.25); mundo.add(b); nodos.aire.brisa.push(b); } }
  // Horno
  { const g = new THREE.Group(); g.position.set(0.9, 0, -2.5);
    const cuerpo = caja(1.25, 0.95, 0.8, 0x2b3833, { rough: 0.45, metal: 0.35 }); cuerpo.position.y = 0.475; g.add(cuerpo);
    const puerta = caja(0.9, 0.45, 0.02, 0x0f1512, { emissive: 0xff7a1a, ei: 0.0, sombra: false }); puerta.position.set(0, 0.5, 0.41); g.add(puerta);
    const top = caja(1.25, 0.04, 0.8, 0x6f7a74, { metal: 0.6, rough: 0.3 }); top.position.y = 0.97; g.add(top);
    mundo.add(g); nodos.horno = { grupo: g, punto: new THREE.Vector3(0.9, 1.0, -2.5), puerta }; }
  // Mostrador con caja registradora
  { const g = new THREE.Group(); g.position.set(0.1, 0, 0.9);
    const m = caja(2.6, 1.0, 0.75, C.madera, { rough: 0.8 }); m.position.y = 0.5; g.add(m);
    const tapa = caja(2.7, 0.05, 0.85, C.tinta, { rough: 0.5 }); tapa.position.y = 1.02; g.add(tapa);
    const pantalla = caja(0.5, 0.34, 0.04, C.tinta); pantalla.position.set(0.6, 1.3, -0.1); pantalla.rotation.x = -0.15; g.add(pantalla);
    const brillo = caja(0.44, 0.28, 0.01, 0xa6e3cf, { emissive: 0x3fc8a4, ei: 0.6, sombra: false }); brillo.position.set(0.6, 1.3, -0.075); brillo.rotation.x = -0.15; g.add(brillo);
    const pie = caja(0.06, 0.2, 0.06, C.tinta); pie.position.set(0.6, 1.1, -0.12); g.add(pie);
    mundo.add(g); nodos.equipos = { grupo: g, punto: new THREE.Vector3(0.7, 1.05, 0.8), pantalla: brillo }; }
  // Lámparas colgantes
  { const bombillos = [];
    [-1.6, 0.4, 2.2].forEach((x) => {
      const cordon = caja(0.015, 0.55, 0.015, C.tinta, { sombra: false }); cordon.position.set(x, 3.0, 0.1); mundo.add(cordon);
      const pantalla = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.26, 24, 1, true), new THREE.MeshStandardMaterial({ color: C.tinta, side: THREE.DoubleSide, roughness: 0.5 }));
      pantalla.position.set(x, 2.62, 0.1); mundo.add(pantalla);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd36b, emissiveIntensity: 1.6 }));
      b.position.set(x, 2.5, 0.1); mundo.add(b); bombillos.push(b);
    });
    nodos.luces = { punto: new THREE.Vector3(0.4, 2.7, 0.1), bombillos }; }

  // Cables: salen del tablero, suben al cielo raso y bajan a cada equipo
  const origen = tablero.position.clone().add(new THREE.Vector3(0.1, 0.55, 0));
  const rutas = {};
  const matCable = new THREE.MeshStandardMaterial({ color: C.cable, roughness: 0.6 });
  function ruta(id, destino, via) {
    const pts = [origen.clone(), new THREE.Vector3(origen.x + 0.05, 3.15, origen.z), ...via, destino.clone()];
    const curva = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.2);
    const tubo = new THREE.Mesh(new THREE.TubeGeometry(curva, 90, 0.022, 6, false), matCable);
    mundo.add(tubo); rutas[id] = curva;
  }
  ruta("frio",   nodos.frio.punto,   [new THREE.Vector3(-2.0, 3.15, -2.85), new THREE.Vector3(2.95, 3.15, -2.85), new THREE.Vector3(2.95, 2.4, -2.6)]);
  ruta("aire",   nodos.aire.punto,   [new THREE.Vector3(-2.6, 3.15, -2.9), new THREE.Vector3(-1.1, 3.1, -2.9)]);
  ruta("horno",  nodos.horno.punto,  [new THREE.Vector3(-2.2, 3.12, -2.95), new THREE.Vector3(0.9, 3.12, -2.95), new THREE.Vector3(0.9, 1.4, -2.95)]);
  ruta("luces",  nodos.luces.punto,  [new THREE.Vector3(-2.6, 3.2, -0.6), new THREE.Vector3(-1.6, 3.25, 0.1), new THREE.Vector3(0.4, 3.25, 0.1)]);
  ruta("equipos",nodos.equipos.punto,[new THREE.Vector3(-3.9, 3.1, 0.4), new THREE.Vector3(-3.9, 0.3, 0.9), new THREE.Vector3(-1.0, 0.25, 0.95)]);

  // Partículas de energía: una malla instanciada por ruta
  const POR_RUTA = 26;
  const geoP = new THREE.SphereGeometry(0.045, 10, 8);
  const flujos = {};
  for (const e of EQUIPOS) {
    const mat = new THREE.MeshBasicMaterial({ color: C.ambar, transparent: true, opacity: 0.95 });
    const inst = new THREE.InstancedMesh(geoP, mat, POR_RUTA);
    inst.frustumCulled = false;
    mundo.add(inst);
    flujos[e.id] = { inst, mat, fases: Array.from({ length: POR_RUTA }, (_, i) => i / POR_RUTA), color: new THREE.Color(C.ambar) };
  }

  // Etiquetas de costo y anillos de módulo
  const etiquetas = {}; const anillos = {};
  const posEtiq = { frio: [2.95, 2.55, -2.2], aire: [-1.1, 3.25, -2.6], horno: [0.9, 1.55, -2.2], luces: [1.6, 2.15, 0.4], equipos: [0.7, 1.8, 1.1] };
  for (const e of EQUIPOS) {
    const hex = e.fuga ? "#f0a202" : "#e9efe8";
    const sp = etiqueta("$" + e.mes.toLocaleString("es-CO"), e.fuga ? "Aire · prendido de noche" : e.nombre + " · al mes", hex);
    sp.position.set(...posEtiq[e.id]); sp.material.opacity = 0; mundo.add(sp); etiquetas[e.id] = sp;
    if (e.modulo) {
      const a = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 48), new THREE.MeshStandardMaterial({ color: C.ahorro, emissive: C.ahorroClaro, emissiveIntensity: 0.9 }));
      const p = (e.id === "luces" ? nodos.luces.punto : nodos[e.id].punto).clone();
      a.position.set(p.x, p.y + 0.35, p.z + 0.35); a.rotation.x = Math.PI / 2.6; a.scale.setScalar(0.001); mundo.add(a); anillos[e.id] = a;
    }
  }

  // Estados de cámara
  const ESTADOS = {
    ambiente: { cam: new THREE.Vector3(9.2, 6.4, 10.2), mira: new THREE.Vector3(0, 1.1, -0.6) },
    medir:    { cam: new THREE.Vector3(1.4, 3.1, 3.2),  mira: new THREE.Vector3(-3.5, 1.5, -1.7) },
    entender: { cam: new THREE.Vector3(7.8, 5.6, 9.0),  mira: new THREE.Vector3(0, 1.4, -1.0) },
    ahorrar:  { cam: new THREE.Vector3(-6.2, 5.8, 9.4), mira: new THREE.Vector3(0.6, 1.3, -1.0) }
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
  const m4 = new THREE.Matrix4(); const v = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
  const colAmbar = new THREE.Color(C.ambar), colAhorro = new THREE.Color(C.ahorroClaro);
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
      const f = flujos[e.id]; const curva = rutas[e.id];
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
      et.material.opacity += ((mix.entender > 0.5 ? 1 : 0) - et.material.opacity) * Math.min(1, dt * 4);
      et.position.y = posEtiq[e.id][1] + Math.sin(t * 1.3 + posEtiq[e.id][0]) * 0.04;
      const a = anillos[e.id];
      if (a) {
        const meta = mix.ahorrar > 0.5 && modulosActivos.has(e.id) ? 1 : 0.001;
        a.scale.setScalar(a.scale.x + (meta - a.scale.x) * Math.min(1, dt * 5));
        a.rotation.z += dt * 1.4;
      }
    }

    // Detalles vivos
    led.material.emissiveIntensity = 1 + Math.max(0, Math.sin(t * (2 + kwTotal))) * 3;
    halo.material.opacity = mix.medir * (0.18 + Math.sin(t * 3) * 0.06);
    halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    const abiertoAhora = abierto(hora);
    nodos.luces.bombillos.forEach((b) => { b.material.emissiveIntensity += ((abiertoAhora ? 1.8 : (modulosActivos.has("luces") && mix.ahorrar > 0.5 ? 0.05 : 0.5)) - b.material.emissiveIntensity) * dt * 3; });
    nodos.horno.puerta.material.emissiveIntensity = abiertoAhora ? 0.5 + Math.sin(t * 2) * 0.2 : 0;
    const aireKw = kwEquipo(EQUIPOS[1], hora);
    nodos.aire.brisa.forEach((b, i) => { b.material.opacity = Math.min(0.55, aireKw / 5) * (0.5 + 0.5 * Math.sin(t * 2.4 - i)); });

    renderer.render(escena, camara);

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
