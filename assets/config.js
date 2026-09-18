// Configuración pública del prototipo. La clave "publishable" es pública por diseño:
// las políticas RLS de Supabase solo le permiten INSERTAR eventos y leads, nunca leerlos.
window.VOLTEA_CONFIG = {
  supabaseUrl: "https://icgxyfozuqlxavejnbdf.supabase.co",
  supabaseKey: "sb_publishable_fbA340rIm0iiV1YdfCWXcg_9iWygYd7",

  // Precios de trabajo de la hipótesis (Pivote modular, 2026-09-16).
  // No salen de costos: son cifras para que la hipótesis sea refutable.
  planBase: 99000,
  tarifaKwh: 800, // COP/kWh, rango conservador alrededor de Emcali 2025 (~779)
  modulos: [
    { id: "aire",      nombre: "Control de aire acondicionado", unidad: "por equipo",  precio: 25000, categoria: "aire",          tasa: 0.25, icono: "aire" },
    { id: "frio",      nombre: "Monitor de refrigeración",      unidad: "por equipo",  precio: 18000, categoria: "refrigeracion", tasa: 0.12, icono: "frio" },
    { id: "luces",     nombre: "Iluminación inteligente",       unidad: "por circuito", precio: 20000, categoria: "iluminacion",   tasa: 0.30, icono: "luz" },
    { id: "tomas",     nombre: "Toma inteligente",              unidad: "por toma",    precio: 15000, categoria: "equipos",       tasa: 0.10, icono: "toma" }
  ],

  // Reparto ilustrativo de la factura por tipo de negocio (supuestos de referencia, sin fuente;
  // el medidor real reemplaza estos números en los primeros 30 días).
  perfiles: {
    restaurante: { nombre: "Restaurante o panadería",   reparto: { refrigeracion: 0.32, coccion: 0.24, aire: 0.18, iluminacion: 0.12, equipos: 0.14 }, tipicos: { aire: 2, frio: 3, luces: 3, tomas: 4 } },
    tienda:      { nombre: "Tienda o minimercado",      reparto: { refrigeracion: 0.45, coccion: 0.00, aire: 0.15, iluminacion: 0.20, equipos: 0.20 }, tipicos: { aire: 1, frio: 4, luces: 3, tomas: 3 } },
    oficina:     { nombre: "Oficina o consultorio",     reparto: { refrigeracion: 0.05, coccion: 0.00, aire: 0.45, iluminacion: 0.20, equipos: 0.30 }, tipicos: { aire: 3, frio: 1, luces: 3, tomas: 6 } },
    hotel:       { nombre: "Hotel u hostal",            reparto: { refrigeracion: 0.15, coccion: 0.10, aire: 0.45, iluminacion: 0.15, equipos: 0.15 }, tipicos: { aire: 8, frio: 2, luces: 5, tomas: 6 } },
    taller:      { nombre: "Taller o manufactura liviana", reparto: { refrigeracion: 0.05, coccion: 0.00, aire: 0.15, iluminacion: 0.20, equipos: 0.60 }, tipicos: { aire: 1, frio: 1, luces: 4, tomas: 6 } }
  }
};
