// Backoffice del prototipo Voltea. Lee `eventos` y `leads` de Supabase.
// Las políticas RLS solo devuelven filas si el correo con sesión está en la tabla `admins`.
(() => {
  const CFG = window.VOLTEA_CONFIG;
  const $ = (s) => document.querySelector(s);
  const db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
  const pesos = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("es-CO"));
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fecha = (iso) => { const d = new Date(iso); return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" }).replace(".", "") + " · " + d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: false }); };
  const hora = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const NOMBRE_MOD = Object.fromEntries(CFG.modulos.map((m) => [m.id, m.nombre]));
  const FRANJA = { manana: "Mañana", mediodia: "Mediodía", tarde: "Tarde" };
  const ROL = { yo_solo: "Decide solo", yo_con_socio: "Con socio", otra_persona: "Otra persona" };

  let eventos = [], leads = [];

  /* ---------- Acceso ---------- */
  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const correo = $("#correo").value.trim().toLowerCase();
    const msg = $("#msg-login"); msg.className = "msg"; msg.textContent = "Enviando…";
    $("#btn-login").disabled = true;
    const { error } = await db.auth.signInWithOtp({ email: correo, options: { emailRedirectTo: location.origin + location.pathname } });
    $("#btn-login").disabled = false;
    if (error) { msg.className = "msg error"; msg.textContent = "No se pudo enviar el enlace: " + error.message; return; }
    msg.textContent = "Listo. Revisa tu correo y abre el enlace desde este mismo navegador.";
  });
  $("#btn-salir").addEventListener("click", async () => { await db.auth.signOut(); location.reload(); });

  async function iniciar(sesion) {
    if (!sesion) { $("#vista-login").hidden = false; $("#vista-panel").hidden = true; return; }
    const { data: admin } = await db.from("admins").select("email").eq("email", sesion.user.email.toLowerCase()).maybeSingle();
    if (!admin) {
      $("#vista-login").hidden = false; $("#vista-panel").hidden = true;
      const msg = $("#msg-login"); msg.className = "msg error";
      msg.textContent = `El correo ${sesion.user.email} no tiene acceso a este backoffice.`;
      return;
    }
    $("#vista-login").hidden = true; $("#vista-panel").hidden = false;
    await cargar();
  }
  db.auth.getSession().then(({ data }) => iniciar(data.session));
  db.auth.onAuthStateChange((evento, sesion) => { if (evento === "SIGNED_IN") iniciar(sesion); });

  /* ---------- Datos ---------- */
  async function cargar() {
    $("#estado").textContent = "Cargando…";
    const [ev, ld] = await Promise.all([
      db.from("eventos").select("*").order("creado", { ascending: false }).limit(10000),
      db.from("leads").select("*").order("creado", { ascending: false }).limit(2000)
    ]);
    if (ev.error || ld.error) { $("#estado").textContent = "Error: " + (ev.error || ld.error).message; return; }
    eventos = ev.data; leads = ld.data;
    const entrevistadores = [...new Set([...eventos, ...leads].map((r) => r.entrevistador).filter(Boolean))].sort();
    const sel = $("#f-entrevistador"), actual = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + entrevistadores.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
    sel.value = entrevistadores.includes(actual) ? actual : "";
    $("#estado").textContent = "Actualizado " + new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    pintar();
  }
  $("#btn-actualizar").addEventListener("click", cargar);
  $("#f-entrevistador").addEventListener("change", pintar);
  $("#f-pruebas").addEventListener("change", pintar);
  setInterval(() => { if (!$("#vista-panel").hidden && document.visibilityState === "visible") cargar(); }, 45000);

  function filtrar(filas) {
    const ent = $("#f-entrevistador").value, sinPruebas = $("#f-pruebas").checked;
    return filas.filter((r) => (!ent || r.entrevistador === ent) && (!sinPruebas || r.origen !== "prueba"));
  }

  /* ---------- Puntaje de compromiso por sesión ---------- */
  function sesiones(evs, lds) {
    const mapa = new Map();
    for (const e of [...evs].reverse()) {
      if (!mapa.has(e.sesion)) mapa.set(e.sesion, { sesion: e.sesion, inicio: e.creado, fin: e.creado, dispositivo: e.dispositivo, entrevistador: e.entrevistador, origen: e.origen, pasos: new Set(), plan: null, calc: null, lead: null });
      const s = mapa.get(e.sesion); s.fin = e.creado;
      if (e.tipo === "seccion_vista" && e.datos?.seccion === "plan") s.pasos.add("precios");
      if (e.tipo === "calculadora_usada") { s.pasos.add("calculadora"); s.calc = e.datos; }
      if (e.tipo === "plan_armado") { s.plan = e.datos; s.pasos.add((e.datos?.modulos?.length ?? 0) > 0 ? "modulo" : "plan"); }
      if (e.tipo === "formulario_iniciado") s.pasos.add("formulario");
      if (e.tipo === "lead_enviado") s.pasos.add("agendo");
      if (e.tipo === "cupo_apartado") s.pasos.add("cupo");
    }
    for (const l of lds) {
      const s = mapa.get(l.sesion) || { sesion: l.sesion, inicio: l.creado, fin: l.creado, dispositivo: null, entrevistador: l.entrevistador, origen: l.origen, pasos: new Set(), plan: null, calc: null };
      s.lead = l; s.pasos.add("agendo");
      if (l.acepta_precio) s.pasos.add("precio");
      if (l.cupo_apartado) s.pasos.add("cupo");
      if ((l.modulos?.length ?? 0) > 0) s.pasos.add("modulo");
      mapa.set(l.sesion, s);
    }
    for (const s of mapa.values()) {
      const p = s.pasos;
      s.puntaje = Math.min(100,
        (p.has("precios") ? 5 : 0) + (p.has("calculadora") ? 15 : 0) + (p.has("modulo") ? 20 : p.has("plan") ? 5 : 0) +
        (p.has("formulario") ? 5 : 0) + (p.has("agendo") ? 25 : 0) + (p.has("precio") ? 10 : 0) + (p.has("cupo") ? 20 : 0));
      s.nivel = s.puntaje >= 70 ? 3 : s.puntaje >= 45 ? 2 : s.puntaje >= 20 ? 1 : 0;
    }
    return [...mapa.values()].sort((a, b) => b.puntaje - a.puntaje || new Date(b.fin) - new Date(a.fin));
  }
  const NIVEL = ["Curioso", "Interesado", "Comprometido", "Intención de compra"];

  /* ---------- Render ---------- */
  function pintar() {
    const evs = filtrar(eventos), lds = filtrar(leads);
    const ses = sesiones(evs, lds);
    const cuenta = (paso) => ses.filter((s) => s.pasos.has(paso)).length;
    const conEntrevistador = ses.filter((s) => s.entrevistador).length;
    const leadsPrecio = lds.filter((l) => l.acepta_precio).length;
    const leadsModulo = lds.filter((l) => (l.modulos?.length ?? 0) > 0).length;

    // KPIs
    const kpis = [
      ["Visitantes", ses.length, `${conEntrevistador} con entrevistador`],
      ["Usaron la calculadora", cuenta("calculadora"), pct(cuenta("calculadora"), ses.length)],
      ["Eligieron módulos", cuenta("modulo"), pct(cuenta("modulo"), ses.length)],
      ["Agendaron instalación", lds.length, pct(lds.length, ses.length)],
      ["Aceptaron el precio", leadsPrecio, lds.length ? `${Math.round((leadsPrecio / lds.length) * 100)} % de quienes agendaron` : "—"],
      ["Apartaron cupo", lds.filter((l) => l.cupo_apartado).length, "puerta falsa, sin cobro"]
    ];
    $("#kpis").innerHTML = kpis.map(([r, v, s]) => `<div class="kpi"><span class="kpi-rotulo">${r}</span><span class="kpi-valor">${v}</span><span class="kpi-sub">${s}</span></div>`).join("");

    // Criterio de éxito
    const criterios = [
      { t: "Agendan la instalación con el precio explícito", v: leadsPrecio, meta: 4, refuta: 2 },
      { t: "Eligen al menos un módulo", v: leadsModulo, meta: 2 }
    ];
    $("#criterios").innerHTML = criterios.map((c) => {
      const cumple = c.v >= c.meta;
      const estado = cumple ? "Se cumple la meta" : c.refuta != null && conEntrevistador >= 10 && c.v < c.refuta ? "Señal de cambio de rumbo" : `Faltan ${c.meta - c.v}`;
      return `<div class="criterio ${cumple ? "cumple" : ""}"><div class="criterio-top"><strong>${c.t}</strong><span class="criterio-cifra">${c.v} / ${c.meta}</span></div><div class="progreso"><i style="width:${Math.min(100, (c.v / c.meta) * 100)}%"></i></div><span class="criterio-estado">${estado}</span></div>`;
    }).join("");

    // Embudo
    const etapas = [
      ["Visitaron", ses.length], ["Vieron precios", cuenta("precios")], ["Usaron calculadora", cuenta("calculadora")],
      ["Eligieron módulo", cuenta("modulo")], ["Abrieron formulario", cuenta("formulario")], ["Agendaron", cuenta("agendo"), true],
      ["Aceptaron precio", cuenta("precio"), true], ["Apartaron cupo", cuenta("cupo"), true]
    ];
    const base = Math.max(1, ses.length);
    $("#embudo").innerHTML = etapas.map(([n, v, fuerte]) => `<div class="etapa ${fuerte ? "fuerte" : ""}"><span>${n}</span><span class="etapa-barra"><i style="width:${(v / base) * 100}%"></i></span><span class="etapa-num">${v} <small>${Math.round((v / base) * 100)} %</small></span></div>`).join("");

    // Leads
    const sesPorId = new Map(ses.map((s) => [s.sesion, s]));
    $("#tabla-leads").innerHTML = lds.length ? `<thead><tr><th>Fecha</th><th>Nombre · negocio</th><th>Tipo · ciudad</th><th>WhatsApp</th><th>Aprueba pagos</th><th class="num">Factura</th><th>Plan</th><th class="num">Total/mes</th><th>Precio</th><th>Cupo</th><th>Visita</th><th>Compromiso</th><th>Entrev.</th></tr></thead><tbody>` +
      lds.map((l) => {
        const s = sesPorId.get(l.sesion);
        const tel = String(l.whatsapp).replace(/\D/g, "");
        const wa = tel ? `https://wa.me/${tel.length === 10 ? "57" + tel : tel}` : null;
        return `<tr>
          <td class="fecha">${fecha(l.creado)}</td>
          <td><strong>${esc(l.nombre)}</strong><br><span class="no">${esc(l.negocio)}</span></td>
          <td>${esc(CFG.perfiles[l.tipo_negocio]?.nombre || l.tipo_negocio)}<br><span class="no">${esc(l.ciudad)}</span></td>
          <td class="mono">${wa ? `<a href="${wa}" target="_blank" rel="noopener">${esc(l.whatsapp)}</a>` : esc(l.whatsapp)}${l.correo ? `<br><span class="no">${esc(l.correo)}</span>` : ""}</td>
          <td>${esc(ROL[l.rol] || l.rol)}</td>
          <td class="num">${pesos(l.factura_mensual)}</td>
          <td>${(l.modulos || []).length ? l.modulos.map((m) => `${esc(NOMBRE_MOD[m.id] || m.id)} × ${m.unidades}`).join("<br>") : '<span class="no">Solo base</span>'}</td>
          <td class="num">${pesos(l.total_mensual)}</td>
          <td>${l.acepta_precio ? '<span class="si">Sí</span>' : '<span class="no">No</span>'}</td>
          <td>${l.cupo_apartado ? '<span class="si">Sí</span>' : '<span class="no">No</span>'}</td>
          <td class="mono">${l.fecha_preferida ? new Date(l.fecha_preferida + "T12:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "—"} <br><span class="no">${esc(FRANJA[l.franja_preferida] || l.franja_preferida || "")}</span></td>
          <td>${s ? badge(s) : "—"}</td>
          <td class="mono">${esc(l.entrevistador || "—")}</td>
        </tr>`;
      }).join("") + "</tbody>" : '<tbody><tr><td class="vacio">Todavía no hay solicitudes. Aparecen aquí apenas alguien envía el formulario.</td></tr></tbody>';

    // Sesiones
    const PASOS = [["precios", "precios"], ["calculadora", "calc."], ["modulo", "módulo"], ["formulario", "form."], ["agendo", "agendó"], ["precio", "precio"], ["cupo", "cupo"]];
    $("#tabla-sesiones").innerHTML = ses.length ? `<thead><tr><th>Última actividad</th><th>Visitante</th><th>Pasos</th><th class="num">Factura (calc.)</th><th class="num">Plan armado</th><th>Compromiso</th><th>Dispositivo</th><th>Entrev.</th></tr></thead><tbody>` +
      ses.slice(0, 300).map((s) => `<tr>
        <td class="fecha">${fecha(s.fin)}</td>
        <td>${s.lead ? `<strong>${esc(s.lead.nombre)}</strong>` : `<span class="mono no">${esc(s.sesion.slice(0, 8))}</span>`}</td>
        <td><div class="chips">${PASOS.map(([k, n]) => `<span class="chip ${s.pasos.has(k) ? "on" : ""}">${n}</span>`).join("")}</div></td>
        <td class="num">${pesos(s.lead?.factura_mensual ?? s.calc?.factura)}</td>
        <td class="num">${s.plan ? pesos(s.plan.total) : "—"}</td>
        <td>${badge(s)}</td>
        <td>${esc(s.dispositivo || "—")}</td>
        <td class="mono">${esc(s.entrevistador || "—")}</td>
      </tr>`).join("") + "</tbody>" : '<tbody><tr><td class="vacio">Sin visitas todavía.</td></tr></tbody>';

    // Actividad
    const ETIQ = { visita: "Entró a la página", seccion_vista: "Vio sección", cta_click: "Clic en", calculadora_usada: "Usó la calculadora", plan_armado: "Armó un plan", formulario_iniciado: "Empezó el formulario", lead_enviado: "Agendó instalación", cupo_apartado: "Apartó cupo", faq_abierta: "Abrió pregunta" };
    $("#actividad").innerHTML = evs.slice(0, 60).map((e) => {
      let det = "";
      if (e.tipo === "seccion_vista") det = e.datos?.seccion; else if (e.tipo === "cta_click") det = e.datos?.cta;
      else if (e.tipo === "calculadora_usada") det = `factura ${pesos(e.datos?.factura)}`; else if (e.tipo === "plan_armado") det = `${pesos(e.datos?.total)}/mes · ${e.datos?.modulos?.length ?? 0} módulos`;
      else if (e.tipo === "faq_abierta") det = e.datos?.pregunta; else if (e.tipo === "lead_enviado") det = `${pesos(e.datos?.total)}/mes${e.datos?.acepta_precio ? " · aceptó precio" : ""}`;
      return `<li><span class="t">${hora(e.creado)}</span><span class="s">${esc(e.sesion.slice(0, 8))}</span><span>${ETIQ[e.tipo] || e.tipo}${det ? ` · <span class="no">${esc(det)}</span>` : ""}</span></li>`;
    }).join("") || '<li class="vacio">Sin actividad.</li>';

    ultimo = { ses, lds };
  }
  let ultimo = { ses: [], lds: [] };
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} % de visitantes` : "—");
  const badge = (s) => `<span class="puntaje"><span class="puntaje-barra"><i style="width:${s.puntaje}%"></i></span><span class="pill nivel-${s.nivel}">${NIVEL[s.nivel]} · ${s.puntaje}</span></span>`;

  /* ---------- Exportar ---------- */
  function csv(nombre, filas) {
    if (!filas.length) return;
    const cols = Object.keys(filas[0]);
    const txt = [cols.join(";"), ...filas.map((f) => cols.map((c) => `"${String(f[c] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" }));
    a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $("#csv-leads").addEventListener("click", () => csv("voltea-solicitudes.csv", ultimo.lds.map((l) => ({
    fecha: l.creado, nombre: l.nombre, negocio: l.negocio, tipo: l.tipo_negocio, ciudad: l.ciudad, whatsapp: l.whatsapp, correo: l.correo, aprueba_pagos: l.rol,
    factura_mensual: l.factura_mensual, modulos: (l.modulos || []).map((m) => `${m.id}x${m.unidades}`).join(" "), total_mensual: l.total_mensual,
    acepta_precio: l.acepta_precio ? "si" : "no", cupo_apartado: l.cupo_apartado ? "si" : "no", fecha_preferida: l.fecha_preferida, franja: l.franja_preferida, entrevistador: l.entrevistador, origen: l.origen
  }))));
  $("#csv-sesiones").addEventListener("click", () => csv("voltea-visitantes.csv", ultimo.ses.map((s) => ({
    sesion: s.sesion, inicio: s.inicio, ultima_actividad: s.fin, dispositivo: s.dispositivo, entrevistador: s.entrevistador, origen: s.origen,
    pasos: [...s.pasos].join(" "), puntaje: s.puntaje, nivel: NIVEL[s.nivel], factura_calculadora: s.calc?.factura, total_plan: s.plan?.total, agendo: s.lead ? "si" : "no"
  }))));
})();
