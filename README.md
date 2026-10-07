# Voltea · prototipo de validación

Landing page con animación 3D y backoffice de intención de compra para el PROTO del **Equipo 6** — Experimentación y Estrategia de Negocio, Universidad Icesi (2026-2). Voltea es un nombre de trabajo.

**Versión 2 (cuaderno de experimento de EXPVAL, 2026-10-07):** el dueño o administrador que aprueba los pagos de una pyme de Cali y su área metropolitana, con factura de al menos $800.000 y algún equipo controlable, agenda la instalación del medidor en los 7 días siguientes y acepta pagar **$49.000 al mes + 10% del ahorro que el medidor demuestre**, si entiende que medimos (no vendemos) energía, si la instalación es una visita sin obras ni cambios de voltaje y si tiene **7 días de prueba gratis**. El experimento es de 5 entrevistas (una por integrante) que terminan pidiendo agendar; el backoffice sigue el cuaderno: se sostiene con ≥2 de 5 que agendan con el precio, se refuta si nadie agenda. El botón de apartar cupo queda en la página, pero ya no es criterio.

Los equipos de la escena 3D (tablero con medidor, nevera, aire, horno y mostrador) se modelan por código en Blender: `blender/modelos_voltea.py` → `assets/modelos/*.glb`. Para regenerarlos:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P blender/modelos_voltea.py -- assets/modelos
```

Hipótesis del PROTO (versión 1, pivote modular del 2026-09-16): el dueño o administrador de una pyme de comercio, servicios o manufactura liviana en Cali y su área metropolitana contrata el plan base (medidor sin costo inicial + app, COP 99.000/mes) y agrega al menos un módulo, si en 30 días el medidor le muestra qué equipos y a qué horas consume y el ahorro del primer módulo supera su costo, sin inversión inicial ni permanencia.

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
