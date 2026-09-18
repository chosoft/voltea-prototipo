# Voltea · prototipo de validación

Landing page con animación 3D y backoffice de intención de compra para el PROTO del **Equipo 6** — Experimentación y Estrategia de Negocio, Universidad Icesi (2026-2). Voltea es un nombre de trabajo.

Hipótesis que prueba (pivote modular, propuesta del 2026-09-16): el dueño o administrador de una pyme de comercio, servicios o manufactura liviana en Cali y su área metropolitana contrata el plan base (medidor sin costo inicial + app, COP 99.000/mes) y agrega al menos un módulo, si en 30 días el medidor le muestra qué equipos y a qué horas consume y el ahorro del primer módulo supera su costo, sin inversión inicial ni permanencia.

## Qué hay

| Archivo | Qué es |
|---|---|
| `index.html` | La landing: relato 3D (medir → entender → ahorrar), factura vs. desglose, calculadora, armado del plan con precios, formulario para agendar la instalación y puerta falsa de "apartar cupo" |
| `admin.html` | Backoffice: embudo, criterio de éxito de la hipótesis, puntaje de compromiso por visitante, solicitudes, CSV |
| `assets/escena.js` | Escena 3D (three.js) |
| `assets/app.js` | Lógica de la landing y registro de eventos |
| `assets/config.js` | URL de Supabase, clave pública y precios de trabajo |
| `supabase/esquema.sql` | Tablas, políticas RLS y función `apartar_cupo` |

## Enlaces para entrevistar

- Con entrevistador: `…/voltea-prototipo/?e=juan` (cambia `juan` por quien entrevista). Así el backoffice separa las entrevistas del tráfico suelto.
- Para probar sin ensuciar los datos: `…/?prueba=1`. El backoffice oculta esas sesiones por defecto.

## Seguridad

La clave de `config.js` es la clave *publishable* de Supabase: es pública por diseño. Las políticas RLS solo le permiten **insertar** eventos y solicitudes; leer o borrar exige iniciar sesión con un correo registrado en la tabla `admins`.

La "puerta falsa" de apartar cupo no cobra ni pide datos de pago: registra la intención y enseguida le dice al visitante que es un piloto universitario.
