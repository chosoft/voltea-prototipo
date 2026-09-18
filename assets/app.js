// Lógica del prototipo Voltea.
// Cada acción que compromete al visitante se registra en Supabase (tabla `eventos`)
// y el formulario crea una fila en `leads`. El backoffice (admin.html) lee ambas.
const CFG = window.VOLTEA_CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pesos = (n) => "$" + Math.round(n).toLocaleString("es-CO");
const soloDigitos = (t) => Number(String(t).replace(/\D/g, "")) || 0;

/* ---------- Sesión y registro ---------- */
const params = new URLSearchParams(location.search);
const limpiar = (t, max) => (t || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, max) || null;
const entrevistador = limpiar(params.get("e"), 40);
const origen = params.get("prueba") === "1" ? "prueba" : (limpiar(params.get("utm_source") || params.get("o"), 80) || "directo");
const dispositivo = matchMedia("(max-width: 640px)").matches ? "movil" : matchMedia("(max-width: 960px)").matches ? "tableta" : "escritorio";

function leer(clave) { try { return sessionStorage.getItem(clave); } catch { return null; } }
function guardar(clave, valor) { try { sessionStorage.setItem(clave, valor); } catch {} }
let sesion = leer("voltea_sesion");
if (!sesion) { sesion = (crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))).slice(0, 36); guardar("voltea_sesion", sesion); }

let db = null;
try { db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false } }); } catch (e) { console.warn("[voltea] sin backend", e); }

const cola = [];
let enviando = false, intentos = 0;
async function vaciarCola() {
  if (!db || enviando || !cola.length) return;
  enviando = true;
  const lote = cola.splice(0, cola.length);
  const { error } = await db.from("eventos").insert(lote);
  enviando = false;
  if (error) {
    console.warn("[voltea] eventos no guardados, reintento", error.message);
    cola.unshift(...lote);
    if (++intentos < 5) setTimeout(vaciarCola, 3000 * intentos);
    return;
  }
  intentos = 0;
  if (cola.length) vaciarCola();
}
function registrar(tipo, datos = {}) {
  cola.push({ sesion, tipo, datos, entrevistador, origen, dispositivo });
  return vaciarCola();
}
const unaVez = new Set();
function registrarUnaVez(clave, tipo, datos) { if (unaVez.has(clave)) return; unaVez.add(clave); registrar(tipo, datos); }

registrar("visita", { ref: document.referrer ? new URL(document.referrer).hostname : null, ancho: innerWidth });

/* ---------- Escena 3D y relato por pasos ---------- */
let escena = null;
const lcd = { hora: $("#lcd-hora"), kw: $("#lcd-kw"), costo: $("#lcd-costo"), estado: $("#lcd-estado"), caja: $("#lcd") };
const pies = {
  ambiente: "Así se mueve la energía en un local típico: del tablero a cada equipo.",
  medir: "El medidor va en el tablero principal: ve todo lo que sale hacia cada equipo.",
  entender: "Cada equipo con su costo al mes. El aire de noche es plata que nadie está usando.",
  ahorrar: "Con módulos activos, el flujo baja y se vuelve ahorro."
};
function alTick({ hora, kw, costoHora, abierto }) {
  const h = Math.floor(hora), m = Math.floor((hora % 1) * 60);
  lcd.hora.textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  lcd.kw.textContent = kw.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  lcd.costo.textContent = Math.round(costoHora).toLocaleString("es-CO");
  lcd.estado.textContent = abierto ? "Local abierto" : "Local cerrado · sigue consumiendo";
  lcd.caja.classList.toggle("cerrado", !abierto);
}
(async () => {
  const contenedor = $("#escena");
  try {
    const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
    if (!gl) throw new Error("sin WebGL");
    const { crearEscena } = await import("./escena.js");
    escena = crearEscena(contenedor, { alTick });
    escena.ponerModulos(plan.modulosActivos());
  } catch (e) {
    console.warn("[voltea] escena 3D no disponible", e);
    contenedor.classList.add("sin-3d");
  }
})();

const pasos = $$(".paso");
const obsPasos = new IntersectionObserver((entradas) => {
  for (const en of entradas) {
    if (!en.isIntersecting) continue;
    pasos.forEach((p) => p.classList.toggle("activo", p === en.target));
    const estado = en.target.dataset.estado;
    escena?.ponerEstado(estado);
    $("#escena-pie").textContent = pies[estado] || pies.ambiente;
    if (estado !== "ambiente") registrarUnaVez("paso-" + estado, "seccion_vista", { seccion: "paso-" + estado });
  }
}, { rootMargin: "-45% 0px -45% 0px" });
pasos.forEach((p) => obsPasos.observe(p));
pasos[0].classList.add("activo");

// Secciones vistas (para el embudo)
const obsSecciones = new IntersectionObserver((entradas) => {
  for (const en of entradas) if (en.isIntersecting) registrarUnaVez("sec-" + en.target.id, "seccion_vista", { seccion: en.target.id });
}, { threshold: 0.35 });
$$("section[data-seccion]").forEach((s) => s.id !== "inicio" && obsSecciones.observe(s));

// Clics en llamados a la acción
document.addEventListener("click", (ev) => {
  const cta = ev.target.closest("[data-cta]");
  if (cta) registrar("cta_click", { cta: cta.dataset.cta });
});
$$("details[data-faq]").forEach((d) => d.addEventListener("toggle", () => d.open && registrarUnaVez("faq-" + d.dataset.faq, "faq_abierta", { pregunta: d.dataset.faq })));

/* ---------- Modelo de ahorro (estimación ilustrativa) ---------- */
const CATEGORIAS = { refrigeracion: "Refrigeración", coccion: "Cocción", aire: "Aire acondicionado", iluminacion: "Iluminación", equipos: "Equipos y tomas" };
const calc = { factura: 3240000, tipo: "restaurante", horas: 12 };

function factorHoras(mod, horas) {
  if (mod.id === "aire" || mod.id === "luces") return { 8: 1.25, 12: 1, 16: 0.85, 24: 0.6 }[horas] ?? 1;
  return 1;
}
function ahorroModulo(mod, unidades, c = calc) {
  if (!unidades) return 0;
  const perfil = CFG.perfiles[c.tipo];
  let alcance = c.factura * (perfil.reparto[mod.categoria] || 0);
  if (mod.id === "tomas") alcance = Math.min(alcance, c.factura * 0.15); // las tomas no tocan cargas pesadas
  const cobertura = Math.min(1, unidades / Math.max(1, perfil.tipicos[mod.id]));
  return alcance * mod.tasa * cobertura * factorHoras(mod, c.horas);
}
const ahorroHabitos = (c = calc) => c.factura * 0.03; // lo que se ahorra solo con ver el desglose y cambiar hábitos

function recomendacion() {
  const perfil = CFG.perfiles[calc.tipo];
  const filas = CFG.modulos.map((m) => {
    const u = Math.min(perfil.tipicos[m.id], m.id === "aire" ? 3 : 4);
    const ahorro = ahorroModulo(m, u);
    return { m, u, ahorro, neto: ahorro - m.precio * u };
  }).sort((a, b) => b.neto - a.neto);
  return filas;
}

/* ---------- Calculadora ---------- */
const tipoSel = $("#calc-tipo"), fTipo = $("#f-tipo");
for (const [id, p] of Object.entries(CFG.perfiles)) { tipoSel.add(new Option(p.nombre, id)); fTipo.add(new Option(p.nombre, id)); }
const inFactura = $("#calc-factura"), inRango = $("#calc-rango");
let calcTocada = false, tCalc = null;

function pintarCalculadora() {
  const perfil = CFG.perfiles[calc.tipo];
  const rec = recomendacion();
  const ahorroPorCat = {};
  let total = ahorroHabitos();
  for (const r of rec) if (r.neto > 0) { total += r.ahorro; ahorroPorCat[r.m.categoria] = (ahorroPorCat[r.m.categoria] || 0) + r.ahorro; }
  const max = Math.max(...Object.values(perfil.reparto));
  $("#calc-reparto").innerHTML = Object.entries(perfil.reparto).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([cat, v]) => {
    const monto = calc.factura * v, ah = ahorroPorCat[cat] || 0;
    return `<div class="reparto-fila"><span>${CATEGORIAS[cat]}</span><span class="reparto-barra"><i style="width:${(v / max) * 100}%"><b style="width:${monto ? (ah / monto) * 100 : 0}%"></b></i></span><span class="mono">${pesos(monto)}</span></div>`;
  }).join("");
  $("#calc-ahorro").textContent = pesos(total);
  const top = rec[0];
  $("#calc-top").innerHTML = top.neto > 0
    ? `${top.m.nombre}<small>Ahorra ≈ ${pesos(top.ahorro)} y cuesta ${pesos(top.m.precio * top.u)} al mes (${top.u} ${top.m.unidad.replace("por ", "")}${top.u > 1 ? "s" : ""})</small>`
    : `Solo el plan base<small>Con esta factura ningún módulo se paga solo todavía.</small>`;
  return { total, top };
}
function alCambiarCalc() {
  calc.factura = soloDigitos(inFactura.value);
  const res = pintarCalculadora();
  $("#f-factura").value = calc.factura ? calc.factura.toLocaleString("es-CO") : "";
  fTipo.value = calc.tipo;
  plan.pintar();
  calcTocada = true;
  clearTimeout(tCalc);
  tCalc = setTimeout(() => registrar("calculadora_usada", { factura: calc.factura, tipo: calc.tipo, horas: calc.horas, ahorro_estimado: Math.round(res.total), top: res.top.m.id }), 1200);
}
inFactura.addEventListener("input", () => {
  const n = soloDigitos(inFactura.value);
  inFactura.value = n ? n.toLocaleString("es-CO") : "";
  inRango.value = Math.min(Math.max(n, 300000), 20000000);
  alCambiarCalc();
});
inRango.addEventListener("input", () => { inFactura.value = Number(inRango.value).toLocaleString("es-CO"); alCambiarCalc(); });
tipoSel.addEventListener("change", () => { calc.tipo = tipoSel.value; alCambiarCalc(); });
$$('input[name="horas"]').forEach((r) => r.addEventListener("change", () => { calc.horas = Number(r.value); alCambiarCalc(); }));
$("#calc-a-plan").addEventListener("click", () => plan.aplicarRecomendacion(true));

/* ---------- Plan por módulos ---------- */
const ICONOS = {
  aire: '<svg viewBox="0 0 24 24" fill="none" stroke="#0b7a64" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="7" rx="2"/><path d="M7 15c0 2-1 3-2 4M12 15v5M17 15c0 2 1 3 2 4"/></svg>',
  frio: '<svg viewBox="0 0 24 24" fill="none" stroke="#0b7a64" stroke-width="1.8" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/></svg>',
  luz: '<svg viewBox="0 0 24 24" fill="none" stroke="#0b7a64" stroke-width="1.8" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/></svg>',
  toma: '<svg viewBox="0 0 24 24" fill="none" stroke="#0b7a64" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9.5 9v3M14.5 9v3M10 16h4"/></svg>',
  medidor: '<svg viewBox="0 0 24 24" fill="none" stroke="#f0a202" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2.5"/><rect x="7" y="6" width="10" height="5" rx="1"/><path d="M8 15h2M12 15h4M8 18h8"/></svg>'
};
$(".modulo-base .modulo-icono").innerHTML = ICONOS.medidor;

const plan = {
  unidades: Object.fromEntries(CFG.modulos.map((m) => [m.id, 0])),
  modulosActivos() { return CFG.modulos.filter((m) => this.unidades[m.id] > 0).map((m) => m.id); },
  total() { return CFG.planBase + CFG.modulos.reduce((s, m) => s + m.precio * this.unidades[m.id], 0); },
  ahorro() { return ahorroHabitos() + CFG.modulos.reduce((s, m) => s + ahorroModulo(m, this.unidades[m.id]), 0); },
  detalle() { return CFG.modulos.filter((m) => this.unidades[m.id] > 0).map((m) => ({ id: m.id, unidades: this.unidades[m.id], precio: m.precio })); },
  construir() {
    $("#lista-modulos").innerHTML = CFG.modulos.map((m) => `
      <article class="modulo" data-mod="${m.id}">
        <div class="modulo-cabeza">
          <span class="modulo-icono" aria-hidden="true">${ICONOS[m.icono]}</span>
          <div><h3>${m.nombre}</h3><p class="modulo-precio"><span class="mono">${pesos(m.precio)}</span> / mes ${m.unidad}</p></div>
        </div>
        <div class="modulo-pie">
          <div class="contador" role="group" aria-label="Cantidad de ${m.nombre}">
            <button type="button" data-menos="${m.id}" aria-label="Quitar uno">−</button>
            <output id="u-${m.id}" aria-live="polite">0</output>
            <button type="button" data-mas="${m.id}" aria-label="Agregar uno">+</button>
          </div>
          <span class="modulo-ahorro" id="a-${m.id}"></span>
        </div>
      </article>`).join("");
    $("#lista-modulos").addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const id = b.dataset.mas || b.dataset.menos;
      this.unidades[id] = Math.max(0, Math.min(20, this.unidades[id] + (b.dataset.mas ? 1 : -1)));
      this.pintar(); this.registrarCambio();
    });
    // Inclinación 3D sutil de las tarjetas al pasar el puntero
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches && matchMedia("(hover: hover)").matches) {
      $$(".modulo").forEach((card) => {
        card.addEventListener("pointermove", (e) => {
          const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(0)`;
        });
        card.addEventListener("pointerleave", () => { card.style.transform = ""; });
      });
    }
  },
  pintar() {
    for (const m of CFG.modulos) {
      const u = this.unidades[m.id];
      $("#u-" + m.id).textContent = u;
      $(`[data-menos="${m.id}"]`).disabled = u === 0;
      $(`[data-mod="${m.id}"]`).classList.toggle("elegido", u > 0);
      const a = ahorroModulo(m, u || 1), costo = m.precio * (u || 1);
      const el = $("#a-" + m.id);
      el.textContent = u ? `ahorra ≈ ${pesos(a)}/mes` : `≈ ${pesos(ahorroModulo(m, 1))}/mes c/u`;
      el.classList.toggle("flojo", a < costo);
    }
    const lineas = [`<li><span>Plan base · medidor + app</span><span class="mono">${pesos(CFG.planBase)}</span></li>`]
      .concat(CFG.modulos.filter((m) => this.unidades[m.id]).map((m) => `<li><span>${m.nombre} × ${this.unidades[m.id]}</span><span class="mono">${pesos(m.precio * this.unidades[m.id])}</span></li>`));
    $("#resumen-lineas").innerHTML = lineas.join("");
    const total = this.total(), ahorro = this.ahorro(), neto = ahorro - total;
    $("#resumen-total").textContent = pesos(total);
    const netoEl = $("#resumen-neto");
    netoEl.classList.toggle("negativo", neto < 0);
    netoEl.innerHTML = calc.factura
      ? (neto >= 0
        ? `Con una factura de <strong class="mono">${pesos(calc.factura)}</strong>, el ahorro estimado es <strong class="mono">${pesos(ahorro)}</strong>: te quedan ≈ <strong class="mono">${pesos(neto)}</strong> al mes.`
        : `Con una factura de <strong class="mono">${pesos(calc.factura)}</strong>, este plan costaría más de lo que ahorraría (≈ ${pesos(ahorro)}). Prueba con menos módulos.`)
      : "";
    const mods = this.detalle();
    $("#plan-elegido").innerHTML = `Plan elegido: <strong>${mods.length ? "base + " + mods.map((d) => CFG.modulos.find((m) => m.id === d.id).nombre.toLowerCase() + " × " + d.unidades).join(", ") : "solo plan base"}</strong> · <strong>${pesos(total)}/mes</strong> · <a href="#plan">cambiar</a>`;
    $("#f-precio-texto").innerHTML = `Entiendo que, después de la instalación, mi plan cuesta <strong>${pesos(total)} al mes</strong> y que puedo cancelar cuando quiera.`;
    escena?.ponerModulos(this.modulosActivos());
  },
  tCambio: null,
  registrarCambio() {
    clearTimeout(this.tCambio);
    this.tCambio = setTimeout(() => registrar("plan_armado", { modulos: this.detalle(), total: this.total(), ahorro_estimado: Math.round(this.ahorro()), factura: calc.factura }), 1500);
  },
  aplicarRecomendacion(porUsuario) {
    for (const k in this.unidades) this.unidades[k] = 0;
    const top = recomendacion()[0];
    if (top.neto > 0) this.unidades[top.m.id] = Math.min(top.u, 2);
    this.pintar();
    if (porUsuario) this.registrarCambio();
  }
};
plan.construir();
pintarCalculadora();
plan.aplicarRecomendacion(false);
$("#f-factura").value = calc.factura.toLocaleString("es-CO");
fTipo.value = calc.tipo;

/* ---------- Formulario ---------- */
const form = $("#formulario");
const manana = new Date(Date.now() + 864e5);
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
$("#f-fecha").min = iso(manana);
$("#f-fecha").value = iso(new Date(Date.now() + 3 * 864e5));
$("#f-factura").addEventListener("input", (e) => { const n = soloDigitos(e.target.value); e.target.value = n ? n.toLocaleString("es-CO") : ""; });
form.addEventListener("focusin", () => registrarUnaVez("form", "formulario_iniciado", { plan_total: plan.total() }), { once: false });

function marcar(el, malo) { el.setAttribute("aria-invalid", malo ? "true" : "false"); return malo; }
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const v = (id) => $(id).value.trim();
  const errores = [
    marcar($("#f-nombre"), v("#f-nombre").length < 2),
    marcar($("#f-negocio"), v("#f-negocio").length < 2),
    marcar($("#f-whatsapp"), v("#f-whatsapp").replace(/\D/g, "").length < 7),
    marcar($("#f-rol"), !v("#f-rol")),
    marcar($("#f-fecha"), !v("#f-fecha") || v("#f-fecha") < $("#f-fecha").min),
    marcar($("#f-correo"), v("#f-correo") && !/^\S+@\S+\.\S+$/.test(v("#f-correo")))
  ];
  const consiente = $("#f-consentimiento").checked;
  $("#f-consentimiento").closest(".chequeo").classList.toggle("invalido", !consiente);
  const err = $("#error-form");
  if (errores.some(Boolean) || !consiente) {
    err.textContent = !consiente && !errores.some(Boolean) ? "Falta tu autorización para contactarte por WhatsApp." : "Revisa los campos marcados en rojo.";
    err.hidden = false;
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }
  err.hidden = true;
  const boton = $("#f-enviar"); boton.disabled = true; boton.textContent = "Enviando…";
  const lead = {
    sesion, entrevistador, origen,
    nombre: v("#f-nombre"), negocio: v("#f-negocio"), tipo_negocio: fTipo.value, ciudad: v("#f-ciudad"),
    whatsapp: v("#f-whatsapp").slice(0, 20), correo: v("#f-correo") || null, rol: v("#f-rol"),
    factura_mensual: soloDigitos(v("#f-factura")) || null, franja_preferida: v("#f-franja"), fecha_preferida: v("#f-fecha"),
    modulos: plan.detalle(), total_mensual: plan.total(), acepta_precio: $("#f-precio").checked, consentimiento: true
  };
  const { error } = db ? await db.from("leads").insert(lead) : { error: { message: "sin conexión al servidor" } };
  if (error) {
    console.warn("[voltea] lead no guardado", error.message);
    err.textContent = "No pudimos enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo.";
    err.hidden = false; boton.disabled = false; boton.textContent = "Agendar mi instalación";
    return;
  }
  registrar("lead_enviado", { total: lead.total_mensual, modulos: lead.modulos.length, acepta_precio: lead.acepta_precio, rol: lead.rol });
  form.hidden = true;
  const conf = $("#confirmacion");
  $("#conf-titulo").textContent = `Listo, ${lead.nombre.split(" ")[0]}.`;
  $("#conf-texto").textContent = `Recibimos tu solicitud para el ${new Date(lead.fecha_preferida + "T12:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}. Alguien del equipo te escribe por WhatsApp para confirmar la visita.`;
  conf.hidden = false; conf.focus();
});

/* ---------- Puerta falsa: apartar cupo ---------- */
// Mide la intención más fuerte (poner plata) sin cobrar ni pedir datos de pago,
// y enseguida le dice al visitante la verdad.
$("#btn-cupo").addEventListener("click", async () => {
  $("#btn-cupo").disabled = true;
  registrar("cupo_apartado", { monto: 20000, total: plan.total() });
  if (db) await db.rpc("apartar_cupo", { p_sesion: sesion });
  $("#cupo").hidden = true; $("#revelacion").hidden = false;
});
$("#btn-sin-cupo").addEventListener("click", () => {
  registrar("cta_click", { cta: "cupo_no" });
  $("#cupo").hidden = true;
  const r = $("#revelacion"); r.hidden = false;
  r.querySelector("h3").textContent = "Entendido. Tu solicitud sigue en pie.";
});
