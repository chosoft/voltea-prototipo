# Modelos 3D de la landing de Voltea, construidos por código en Blender (modo sin interfaz).
# Convención: el frente de cada modelo mira a -Y de Blender (que el exportador glTF vuelve +Z en three.js).
# Uso: Blender -b -P modelos_voltea.py -- <carpeta_salida>
import bpy, bmesh, math, sys, os
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- Materiales ----------
MATS = {}
def mat(nombre, color, metal=0.0, rug=0.5, emis=None, fuerza=0.0, trans=0.0, alpha=1.0, coat=0.0, ior=1.45):
    if nombre in MATS:
        return MATS[nombre]
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    def put(k, v):
        if k in b.inputs:
            b.inputs[k].default_value = v
    put("Base Color", (*color, 1.0))
    put("Metallic", metal)
    put("Roughness", rug)
    put("IOR", ior)
    if trans:
        put("Transmission Weight", trans)
    if alpha < 1.0:
        put("Alpha", alpha)
    if coat:
        put("Coat Weight", coat)
        put("Coat Roughness", 0.2)
    if emis:
        put("Emission Color", (*emis, 1.0))
        put("Emission Strength", fuerza)
    MATS[nombre] = m
    return m

def hexc(h):
    # sRGB -> lineal
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

M = dict(
    acero=mat("acero_inox", hexc(0xb7bdba), metal=1.0, rug=0.28),
    aceroOsc=mat("acero_oscuro", hexc(0x4a524e), metal=0.9, rug=0.35),
    pintura=mat("metal_pintado", hexc(0x8a928d), metal=0.55, rug=0.42),
    pinturaInt=mat("metal_interior", hexc(0xa7aea9), metal=0.4, rug=0.5),
    plasticoB=mat("plastico_blanco", hexc(0xf4f5f1), rug=0.32, coat=0.6),
    plasticoG=mat("plastico_gris", hexc(0xc9cec9), rug=0.45),
    negro=mat("plastico_negro", hexc(0x1a1f1d), rug=0.5),
    caucho=mat("caucho", hexc(0x121514), rug=0.85),
    vidrio=mat("vidrio", hexc(0xe8f4f6), rug=0.04, trans=1.0, ior=1.45),
    madera=mat("madera", hexc(0xa98157), rug=0.6),
    maderaOsc=mat("madera_oscura", hexc(0x6d4f33), rug=0.55),
    piedra=mat("piedra", hexc(0x2a302d), rug=0.22, metal=0.1),
    cobre=mat("cobre", hexc(0xc77c4a), metal=1.0, rug=0.3),
    verde=mat("verde_voltea", hexc(0x0b7a64), rug=0.35),
    ambarEt=mat("etiqueta", hexc(0xf3f5f0), rug=0.7),
    # Materiales que la escena anima: el nombre es el contrato con escena.js
    lcd=mat("lcd", hexc(0x5fe0bb), rug=0.3, emis=hexc(0x5fe0bb), fuerza=3.0),
    led=mat("led", hexc(0xf0a202), rug=0.3, emis=hexc(0xf0a202), fuerza=4.0),
    brasa=mat("brasa", hexc(0x2a1206), rug=0.4, emis=hexc(0xff7a1a), fuerza=2.0),
    pantalla=mat("pantalla", hexc(0x7fd8bd), rug=0.3, emis=hexc(0x7fd8bd), fuerza=2.0),
    luzFrio=mat("luz_nevera", hexc(0xe8f6ff), rug=0.3, emis=hexc(0xe8f6ff), fuerza=3.0),
)
BOTELLAS = [mat(f"botella_{i}", hexc(c), rug=0.18, coat=0.5) for i, c in enumerate([0xb8422f, 0x2f6cb0, 0xd1962a, 0x3f8a58, 0xd9d2c2, 0x8c2f5f])]

# ---------- Primitivas ----------
def _fin(o, material, bisel, seg, nombre, coleccion):
    o.name = nombre
    o.data.materials.append(material)
    if bisel > 0:
        md = o.modifiers.new("bisel", "BEVEL")
        md.width = bisel
        md.segments = seg
        md.limit_method = "ANGLE"
        md.harden_normals = True
    for c in o.users_collection:
        c.objects.unlink(o)
    coleccion.objects.link(o)
    for p in o.data.polygons:
        p.use_smooth = True
    return o

def caja(col, nombre, tam, pos, material, bisel=0.008, seg=3, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos, rotation=rot)
    o = bpy.context.active_object
    o.scale = tam
    bpy.ops.object.transform_apply(scale=True)
    return _fin(o, material, bisel, seg, nombre, col)

def cilindro(col, nombre, r, alto, pos, material, rot=(0, 0, 0), vert=24, bisel=0.0, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=alto, location=pos, rotation=rot, vertices=vert)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=alto, location=pos, rotation=rot, vertices=vert)
    o = bpy.context.active_object
    return _fin(o, material, bisel, 2, nombre, col)

def botella(col, nombre, x, y, z, material, alto=0.26, r=0.046):
    # Perfil torneado: cuerpo, hombro y cuello, con un modificador Screw.
    bm = bmesh.new()
    perfil = [(0.0, 0), (r, 0), (r, alto * 0.62), (r * 0.45, alto * 0.82), (r * 0.32, alto * 0.86), (r * 0.32, alto), (0.0, alto)]
    vs = [bm.verts.new((px, 0, pz)) for px, pz in perfil]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    o = bpy.data.objects.new(nombre, me)
    col.objects.link(o)
    o.location = (x, y, z)
    sc = o.modifiers.new("torno", "SCREW")
    sc.steps = 12
    sc.render_steps = 12
    sc.use_merge_vertices = True
    o.data.materials.append(material)
    tapa = cilindro(col, nombre + "_tapa", r * 0.36, 0.022, (x, y, z + alto + 0.008), M["negro"], vert=14)
    for p in o.data.polygons:
        p.use_smooth = True
    return o

def coleccion(nombre):
    c = bpy.data.collections.new(nombre)
    bpy.context.scene.collection.children.link(c)
    return c

# ======================================================================
# 1. Tablero eléctrico con el medidor Voltea. Origen en el centro del gabinete.
# ======================================================================
def tablero():
    c = coleccion("tablero")
    W, H, D = 0.86, 1.2, 0.16
    # Gabinete hueco: fondo, laterales, techo, piso
    caja(c, "gab_fondo", (W, 0.02, H), (0, D / 2 - 0.01, 0), M["pintura"], 0.01)
    caja(c, "gab_izq", (0.02, D, H), (-W / 2 + 0.01, 0, 0), M["pintura"], 0.006)
    caja(c, "gab_der", (0.02, D, H), (W / 2 - 0.01, 0, 0), M["pintura"], 0.006)
    caja(c, "gab_techo", (W, D, 0.02), (0, 0, H / 2 - 0.01), M["pintura"], 0.006)
    caja(c, "gab_piso", (W, D, 0.02), (0, 0, -H / 2 + 0.01), M["pintura"], 0.006)
    # Contrafrente con ventana de breakers
    caja(c, "contrafrente_sup", (W - 0.06, 0.012, 0.2), (0, -D / 2 + 0.03, H / 2 - 0.13), M["pinturaInt"], 0.004)
    caja(c, "contrafrente_inf", (W - 0.06, 0.012, 0.12), (0, -D / 2 + 0.03, -H / 2 + 0.09), M["pinturaInt"], 0.004)
    # Dos rieles DIN con breakers
    for fila, z in enumerate((0.26, -0.02)):
        caja(c, f"riel_{fila}", (W - 0.12, 0.012, 0.035), (0, 0.0, z), M["acero"], 0.002)
        for i in range(7):
            x = -0.3 + i * 0.1
            caja(c, f"breaker_{fila}_{i}", (0.085, 0.07, 0.16), (x, -0.03, z), M["plasticoB"], 0.006)
            caja(c, f"palanca_{fila}_{i}", (0.022, 0.03, 0.04), (x, -0.075, z + 0.015), M["negro"], 0.004)
            caja(c, f"rotulo_{fila}_{i}", (0.07, 0.004, 0.022), (x, -0.066, z - 0.055), M["ambarEt"], 0.0)
    # Totalizador grande
    caja(c, "totalizador", (0.17, 0.08, 0.2), (-0.27, -0.03, -0.3), M["negro"], 0.008)
    caja(c, "totalizador_palanca", (0.05, 0.04, 0.06), (-0.27, -0.08, -0.28), M["verde"], 0.006)
    # Medidor Voltea (tipo riel DIN, frente blanco con LCD)
    caja(c, "medidor_cuerpo", (0.3, 0.1, 0.24), (0.12, -0.04, -0.31), M["plasticoB"], 0.018, 4)
    caja(c, "medidor_frente", (0.24, 0.012, 0.15), (0.12, -0.093, -0.29), M["plasticoG"], 0.006)
    caja(c, "medidor_lcd", (0.19, 0.006, 0.075), (0.12, -0.1, -0.27), M["lcd"], 0.003)
    caja(c, "medidor_led", (0.022, 0.006, 0.022), (0.235, -0.1, -0.385), M["led"], 0.003)
    caja(c, "medidor_logo", (0.06, 0.004, 0.012), (0.06, -0.1, -0.385), M["verde"], 0.0)
    for i in range(3):  # pinzas de corriente (CT) sobre las fases
        x = 0.05 + i * 0.07
        cilindro(c, f"ct_{i}", 0.026, 0.035, (x, -0.04, -0.12), M["negro"], rot=(0, 0, 0), vert=20, bisel=0.004)
        cilindro(c, f"ct_hueco_{i}", 0.012, 0.04, (x, -0.04, -0.12), M["cobre"], vert=12)
    # Cables que salen por arriba hacia el local
    for i, x in enumerate((-0.25, -0.12, 0.0, 0.12, 0.25)):
        cilindro(c, f"cable_{i}", 0.012, 0.2, (x, 0.0, H / 2 + 0.06), M["negro"], vert=10)
        cilindro(c, f"prensaestopa_{i}", 0.022, 0.03, (x, 0.0, H / 2 + 0.005), M["plasticoG"], vert=14)
    # Puerta abierta con bisagra a la izquierda
    # Puerta abierta con bisagra a la derecha (+X), para que en la landing no tape el medidor
    # desde la cámara del paso «Medir». ang = dirección de la bisagra al centro de la puerta.
    ang = math.radians(-70)
    bis = Vector((W / 2, -D / 2, 0))
    puerta = caja(c, "puerta", (W - 0.02, 0.02, H - 0.04), (0, 0, 0), M["pintura"], 0.012)
    puerta.location = bis + Vector((math.cos(ang), math.sin(ang), 0)) * (W / 2)
    puerta.rotation_euler = (0, 0, ang)
    caja(c, "cerradura", (0.03, 0.03, 0.08), (0, 0, 0), M["acero"], 0.006).location = (
        bis + Vector((math.cos(ang), math.sin(ang), 0)) * (W - 0.06) + Vector((0, -0.015, 0)))
    caja(c, "senal_riesgo", (0.12, 0.004, 0.1), (0.24, -D / 2 + 0.02, H / 2 - 0.13), mat("amarillo", hexc(0xf2c230), rug=0.5), 0.0)
    return c

# ======================================================================
# 2. Nevera vitrina vertical. Origen en el piso, centro.
# ======================================================================
def nevera():
    c = coleccion("nevera")
    W, H, D = 1.05, 2.05, 0.8
    caja(c, "base", (W, D - 0.04, 0.22), (0, 0, 0.11), M["negro"], 0.01)
    for i in range(9):  # rejilla de ventilación
        caja(c, f"rejilla_{i}", (0.07, 0.01, 0.12), (-0.4 + i * 0.1, -D / 2 + 0.015, 0.11), M["aceroOsc"], 0.003)
    caja(c, "fondo", (W, 0.05, H - 0.22), (0, D / 2 - 0.025, 0.22 + (H - 0.22) / 2), M["plasticoB"], 0.015)
    caja(c, "lado_izq", (0.05, D, H - 0.22), (-W / 2 + 0.025, 0, 0.22 + (H - 0.22) / 2), M["plasticoB"], 0.015)
    caja(c, "lado_der", (0.05, D, H - 0.22), (W / 2 - 0.025, 0, 0.22 + (H - 0.22) / 2), M["plasticoB"], 0.015)
    caja(c, "techo", (W, D, 0.06), (0, 0, H - 0.03), M["plasticoB"], 0.015)
    caja(c, "piso_int", (W - 0.1, D - 0.08, 0.03), (0, 0, 0.235), M["plasticoG"], 0.004)
    # Cabezote iluminado con la marca
    caja(c, "cabezote", (W, 0.12, 0.26), (0, -D / 2 + 0.06, H - 0.16), M["verde"], 0.02)
    caja(c, "cabezote_luz", (W - 0.14, 0.01, 0.12), (0, -D / 2 - 0.002, H - 0.16), M["luzFrio"], 0.004)
    # Puerta de vidrio con marco de aluminio y manija vertical
    zP, hP = 0.24 + (H - 0.5) / 2, H - 0.5
    caja(c, "puerta_vidrio", (W - 0.12, 0.02, hP - 0.08), (0, -D / 2 + 0.02, zP), M["vidrio"], 0.004)
    for n, (sx, sz, px, pz) in enumerate([(W - 0.04, 0.05, 0, zP + hP / 2 - 0.025), (W - 0.04, 0.05, 0, zP - hP / 2 + 0.025),
                                          (0.05, hP, -W / 2 + 0.045, zP), (0.05, hP, W / 2 - 0.045, zP)]):
        caja(c, f"marco_{n}", (sx, 0.05, sz), (px, -D / 2 + 0.02, pz), M["aceroOsc"], 0.008)
    cilindro(c, "manija", 0.016, 0.9, (W / 2 - 0.11, -D / 2 - 0.035, zP), M["acero"], vert=14)
    for s, dz in ((0, 0.45), (1, -0.45)):
        caja(c, f"manija_soporte_{s}", (0.03, 0.05, 0.03), (W / 2 - 0.11, -D / 2 - 0.01, zP + dz), M["acero"], 0.005)
    # Repisas con botellas y latas
    k = 0
    for i in range(4):
        z = 0.5 + i * 0.36
        caja(c, f"repisa_{i}", (W - 0.12, D - 0.16, 0.015), (0, 0.02, z), M["acero"], 0.003)
        for j in range(6):
            for fila in range(2):
                x = -0.38 + j * 0.152
                y = -0.12 + fila * 0.2
                material = BOTELLAS[(i * 2 + j + fila) % len(BOTELLAS)]
                if i == 3:  # la de arriba lleva latas
                    cilindro(c, f"lata_{k}", 0.033, 0.12, (x, y, z + 0.068), material, vert=16)
                else:
                    botella(c, f"botella_{k}", x, y, z + 0.008, material, alto=0.27 if i else 0.3)
                k += 1
    # Tira de luz interior
    caja(c, "luz_interior", (0.025, 0.02, hP - 0.2), (-W / 2 + 0.07, -D / 2 + 0.08, zP), M["luzFrio"], 0.004)
    for x in (-0.42, 0.42):
        cilindro(c, f"pata_{x}", 0.03, 0.03, (x, -0.28, 0.015), M["caucho"], vert=12)
    return c

# ======================================================================
# 3. Aire acondicionado tipo split. Origen en el centro.
# ======================================================================
def aire():
    c = coleccion("aire")
    W, H, D = 1.5, 0.46, 0.3
    caja(c, "cuerpo", (W, D, H), (0, 0, 0), M["plasticoB"], 0.09, 6)
    caja(c, "panel_frontal", (W - 0.06, 0.02, H - 0.16), (0, -D / 2 - 0.004, 0.05), M["plasticoB"], 0.02, 4)
    caja(c, "linea", (W - 0.1, 0.004, 0.006), (0, -D / 2 - 0.016, -0.03), M["plasticoG"], 0.0)
    # Salida de aire con aleta inclinada
    caja(c, "boca", (W - 0.16, 0.08, 0.07), (0, -D / 2 + 0.03, -H / 2 + 0.06), M["negro"], 0.02)
    aleta = caja(c, "aleta", (W - 0.2, 0.012, 0.075), (0, -D / 2 - 0.01, -H / 2 + 0.04), M["plasticoG"], 0.004)
    aleta.rotation_euler = (math.radians(-35), 0, 0)
    for i in range(14):
        caja(c, f"deflector_{i}", (0.006, 0.06, 0.05), (-0.62 + i * 0.095, -D / 2 + 0.01, -H / 2 + 0.07), M["plasticoG"], 0.0)
    # Indicadores
    caja(c, "display", (0.12, 0.006, 0.035), (0.55, -D / 2 - 0.016, -0.02), M["negro"], 0.003)
    caja(c, "display_luz", (0.05, 0.004, 0.014), (0.55, -D / 2 - 0.02, -0.02), M["lcd"], 0.0)
    # Tubería que sale al muro
    cilindro(c, "tubo_1", 0.022, 0.3, (W / 2 - 0.15, 0.0, -H / 2 - 0.12), M["plasticoG"], vert=12)
    cilindro(c, "tubo_2", 0.016, 0.3, (W / 2 - 0.2, 0.0, -H / 2 - 0.12), M["cobre"], vert=12)
    return c

# ======================================================================
# 4. Horno de panadería de dos pisos. Origen en el piso, centro.
# ======================================================================
def horno():
    c = coleccion("horno")
    W, D = 1.25, 0.8
    # Patas y repisa
    for x in (-0.56, 0.56):
        for y in (-0.33, 0.33):
            caja(c, f"pata_{x}_{y}", (0.04, 0.04, 0.22), (x, y, 0.11), M["acero"], 0.004)
    caja(c, "repisa_baja", (W - 0.06, D - 0.06, 0.02), (0, 0, 0.08), M["acero"], 0.003)
    for i in range(3):
        caja(c, f"bandeja_{i}", (0.6, 0.4, 0.015), (-0.2, 0.05, 0.095 + i * 0.018), M["aceroOsc"], 0.002)
    # Cuerpo de dos cámaras
    caja(c, "cuerpo", (W, D, 0.78), (0, 0, 0.22 + 0.39), M["acero"], 0.02, 3)
    for n, z in enumerate((0.42, 0.8)):
        caja(c, f"puerta_{n}", (W - 0.32, 0.03, 0.3), (-0.12, -D / 2 - 0.01, z), M["aceroOsc"], 0.012)
        caja(c, f"visor_{n}", (W - 0.5, 0.012, 0.13), (-0.12, -D / 2 - 0.027, z + 0.02), M["brasa"], 0.004)
        cilindro(c, f"manija_{n}", 0.016, W - 0.4, (-0.12, -D / 2 - 0.07, z + 0.11), M["acero"], rot=(0, math.radians(90), 0), vert=14)
        for s in (-1, 1):
            caja(c, f"manija_sop_{n}_{s}", (0.02, 0.05, 0.02), (-0.12 + s * (W - 0.46) / 2, -D / 2 - 0.045, z + 0.11), M["acero"], 0.004)
    # Panel de control lateral con perillas y termómetros
    caja(c, "panel", (0.22, 0.02, 0.72), (W / 2 - 0.13, -D / 2 - 0.006, 0.61), M["negro"], 0.008)
    for n, z in enumerate((0.86, 0.74, 0.5, 0.38)):
        cilindro(c, f"perilla_{n}", 0.028, 0.03, (W / 2 - 0.13, -D / 2 - 0.03, z), M["acero"], rot=(math.radians(90), 0, 0), vert=20, bisel=0.004)
        caja(c, f"indice_{n}", (0.006, 0.006, 0.02), (W / 2 - 0.13, -D / 2 - 0.046, z + 0.012), M["negro"], 0.0)
    for n, z in enumerate((0.95, 0.62)):
        caja(c, f"termometro_{n}", (0.11, 0.008, 0.04), (W / 2 - 0.13, -D / 2 - 0.02, z), M["lcd"], 0.003)
    # Chimenea y remate
    caja(c, "remate", (W + 0.02, D + 0.02, 0.04), (0, 0, 1.02), M["aceroOsc"], 0.008)
    cilindro(c, "chimenea", 0.06, 0.18, (0.4, 0.22, 1.13), M["aceroOsc"], vert=20)
    return c

# ======================================================================
# 5. Mostrador con caja registradora. Origen en el piso, centro.
# ======================================================================
def mostrador():
    c = coleccion("mostrador")
    W, D, H = 2.6, 0.75, 1.0
    caja(c, "zocalo", (W - 0.08, D - 0.1, 0.08), (0, 0.02, 0.04), M["negro"], 0.004)
    caja(c, "cuerpo", (W, D, H - 0.08), (0, 0, 0.08 + (H - 0.08) / 2), M["madera"], 0.012)
    for i in range(5):  # listones verticales en el frente
        x = -W / 2 + 0.26 + i * 0.52
        caja(c, f"liston_{i}", (0.42, 0.02, H - 0.24), (x, -D / 2 - 0.008, 0.5), M["maderaOsc"], 0.006)
    caja(c, "tapa", (W + 0.12, D + 0.11, 0.05), (0, 0, H + 0.025), M["piedra"], 0.012)
    # Terminal de caja (pantalla táctil sobre pedestal)
    caja(c, "pos_base", (0.26, 0.2, 0.04), (0.6, 0.05, H + 0.07), M["negro"], 0.01)
    caja(c, "pos_brazo", (0.05, 0.05, 0.22), (0.6, 0.1, H + 0.18), M["negro"], 0.01)
    pantalla = caja(c, "pos_marco", (0.5, 0.035, 0.34), (0.6, 0.06, H + 0.33), M["negro"], 0.014)
    pantalla.rotation_euler = (math.radians(-12), 0, 0)
    brillo = caja(c, "pos_pantalla", (0.46, 0.006, 0.3), (0.6, 0.04, H + 0.334), M["pantalla"], 0.003)
    brillo.rotation_euler = (math.radians(-12), 0, 0)
    # Datáfono y cajón
    caja(c, "datafono", (0.09, 0.16, 0.04), (0.18, -0.12, H + 0.07), M["negro"], 0.012)
    caja(c, "datafono_pantalla", (0.06, 0.05, 0.004), (0.18, -0.15, H + 0.092), M["lcd"], 0.0)
    caja(c, "cajon", (0.42, 0.42, 0.1), (0.6, 0.05, H - 0.07), M["aceroOsc"], 0.008)
    # Exhibidor de pan con domo de vidrio
    caja(c, "exhibidor_base", (0.7, 0.4, 0.03), (-0.6, -0.04, H + 0.065), M["maderaOsc"], 0.006)
    cilindro(c, "domo", 0.19, 0.5, (-0.6, -0.04, H + 0.24), M["vidrio"], rot=(0, math.radians(90), 0), vert=32)
    for i in range(5):
        cilindro(c, f"pan_{i}", 0.045, 0.16, (-0.84 + i * 0.12, -0.04, H + 0.12), mat("pan", hexc(0xc98a46), rug=0.7),
                 rot=(math.radians(90), 0, math.radians(15 * (i % 2 * 2 - 1))), vert=14, bisel=0.02)
    return c

constructores = [("tablero", tablero), ("nevera", nevera), ("aire", aire), ("horno", horno), ("mostrador", mostrador)]
cols = {}
for nombre, fn in constructores:
    cols[nombre] = fn()

def exportar(nombre):
    bpy.ops.object.select_all(action="DESELECT")
    for o in cols[nombre].all_objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{nombre}.glb"), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_materials="EXPORT", export_normals=True,
        export_texcoords=False, export_cameras=False, export_lights=False)

for nombre, _ in constructores:
    exportar(nombre)
    print("exportado", nombre, os.path.getsize(os.path.join(OUT, f"{nombre}.glb")) // 1024, "KB")

# ---------- Vista previa: los cinco modelos en fila ----------
offs = {"tablero": (-3.0, 0, 1.75), "nevera": (-1.4, 0, 0), "horno": (0.1, 0, 0), "mostrador": (2.3, 0, 0), "aire": (0.1, 0, 2.3)}
for nombre, (x, y, z) in offs.items():
    for o in cols[nombre].objects:
        if o.parent is None:
            o.location.x += x; o.location.y += y; o.location.z += z
esc = bpy.context.scene
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
piso = bpy.context.active_object
piso.data.materials.append(mat("piso_preview", hexc(0xdbe0d7), rug=0.6))
bpy.ops.object.camera_add(location=(0.3, -7.5, 2.4), rotation=(math.radians(82), 0, 0))
esc.camera = bpy.context.active_object
esc.camera.data.lens = 30
bpy.ops.object.light_add(type="AREA", location=(-3, -4, 6))
bpy.context.active_object.data.energy = 1500
bpy.context.active_object.data.size = 5
bpy.ops.object.light_add(type="SUN", location=(4, -3, 6), rotation=(math.radians(50), math.radians(20), math.radians(30)))
bpy.context.active_object.data.energy = 2.5
mundo = bpy.data.worlds.new("mundo"); esc.world = mundo
mundo.use_nodes = True
bg = mundo.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.85, 0.88, 0.86, 1); bg.inputs[1].default_value = 0.6
for motor in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
    try:
        esc.render.engine = motor
        break
    except TypeError:
        continue
if esc.render.engine == "CYCLES":
    esc.cycles.samples = 48
esc.render.resolution_x, esc.render.resolution_y = 1600, 900
esc.render.filepath = os.path.join(OUT, "_vista_previa.png")
bpy.ops.render.render(write_still=True)
print("motor", esc.render.engine, "vista previa lista")
