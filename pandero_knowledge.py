"""Base de conocimiento para el simulador de atención Pandero.

Compilación temática del manual interno Pandero 1.pdf. No reemplaza SAF,
las tipificaciones ni la validación de un procedimiento vigente. Si el manual
no especifica un dato o depende de la ficha real, la IA debe reconocerlo y
derivar al área responsable en vez de inventarlo.
"""
import random
import re
import unicodedata

ESCENARIOS = [
 {"id":"tentativa_venta","categoria":"Comercial y contratos","nombre":"Tentativa de venta y productos","keywords":["tentativa","venta","contrato nuevo","cotizar","comprar un contrato","auto nuevo","seminuevo","pandero casa"],"objetivo":"Identificar el producto de interés, explicar Pandero de forma general y derivar los datos al área comercial."},
 {"id":"contratos_firma","categoria":"Comercial y contratos","nombre":"Contratos, firma y copia","keywords":["contrato","firmar","copia","documento firmado","programa","tarifario","punto de venta","ejecutivo de ventas"],"objetivo":"Orientar sobre tipos de contrato, firma y obtención de documentos; no inventar tarifarios ni datos de ejecutivos."},
 {"id":"asambleas","categoria":"Asambleas y adjudicación","nombre":"Asambleas, sorteo y remate","keywords":["asamblea","sorteo","remate","adjudicación anticipada","probabilidad","transmisión","resultado"],"objetivo":"Explicar la dinámica general y las diferencias por programa sin prometer una fecha exacta de adjudicación."},
 {"id":"estado_cuenta","categoria":"Pagos y contratos","nombre":"Estado de cuenta y conceptos de cuota","keywords":["estado de cuenta","cuota mensual","aportes","saldo","capital","administrativo","mora"],"objetivo":"Consultar estado y tipificaciones; aplicar la ruta correcta según estado contractual y motivo."},
 {"id":"financiamiento","categoria":"Pagos y contratos","nombre":"Financiamiento y pagos anticipados","keywords":["financiamiento","pago anticipado","adelanto","amortización","cuenta de financiamiento"],"objetivo":"Orientar sobre pago parcial o total anticipado y estado de financiamiento sin calcular importes no disponibles."},
 {"id":"movimientos_contrato","categoria":"Pagos y contratos","nombre":"Transferencia, titularidad, ampliación y fusión","keywords":["transferencia","cambio de titular","titularidad","ampliación","extensión","unión","fusión","reactivación","resolución"],"objetivo":"Identificar el movimiento solicitado y seguir el procedimiento específico sin asegurar aprobaciones."},
 {"id":"devoluciones","categoria":"Devoluciones y retención","nombre":"Separación de vacante y devoluciones","keywords":["separación de vacante","devolución","preinaugural","postinaugural","resuelto","contrato anulado","reembolso","retención"],"objetivo":"Distinguir el tipo de devolución/estado, revisar la solicitud y respuesta en SAF y no prometer plazos que no consten."},
 {"id":"recuperos_1_2","categoria":"Cobranzas y recuperos","nombre":"Bien entregado con 1 o 2 cuotas pendientes","keywords":["una cuota","dos cuotas","1 cuota","2 cuotas","cuotas pendientes","bien entregado","morosidad"],"objetivo":"Verificar tipificaciones y estado de cuenta; informar cuotas, meses y montos cuando estén disponibles, y la cuenta de pago aplicable."},
 {"id":"recuperos_3_mas","categoria":"Cobranzas y recuperos","nombre":"Bien entregado con 3 o más cuotas pendientes","keywords":["tres cuotas","3 cuotas","más cuotas","recuperos","obligación de pago"],"objetivo":"Verificar tipificaciones; informar número de cuotas y meses, facilitar datos completos del ejecutivo de Recuperos y orientar sobre la cuenta aplicable."},
 {"id":"situacion_legal","categoria":"Cobranzas y recuperos","nombre":"Situación legal, carta notarial y recuperos judiciales","keywords":["situación legal","carta notarial","judicial","extrajudicial","orden de captura","levantamiento de captura","deuda pagada"],"objetivo":"No revelar deuda cuando la regla del manual lo prohíbe; informar/derivar al ejecutivo de Recuperos o auxiliar operativo que corresponda."},
 {"id":"retencion","categoria":"Devoluciones y retención","nombre":"Retención y disconformidad con una respuesta","keywords":["retención","no quiero continuar","disconforme","desacuerdo","respuesta negativa","caso especial"],"objetivo":"Escuchar el motivo, consultar la respuesta previa y seguir el procedimiento de retención o caso especial sin garantizar resultado."},
 {"id":"levantamiento_prenda","categoria":"Vehículos y trámites","nombre":"Levantamiento de prenda y constancias","keywords":["levantamiento de prenda","prenda","constancia de no adeudo","cancelación","certificado"],"objetivo":"Verificar estado contractual, entrega del bien, pago total y situación legal; informar requisitos/plazos solo según manual."},
 {"id":"adjudicacion","categoria":"Asambleas y adjudicación","nombre":"Evaluación crediticia y pasos de adjudicación","keywords":["adjudicación","evaluación crediticia","comité de crédito","aval","garantía","pedido vehicular"],"objetivo":"Explicar los pasos de evaluación, pedido, notaría, Sunarp y entrega; no asegurar fecha de entrega."},
 {"id":"entrega_vehiculo","categoria":"Vehículos y trámites","nombre":"Documentos, notaría, Sunarp y entrega del vehículo","keywords":["entrega del vehículo","notaría","sunarp","dua","documentos","orden irrevocable","proforma"],"objetivo":"Guiar sobre fases y documentación según nuevo o seminuevo; validar requisitos vigentes con el área responsable."},
 {"id":"seminuevos","categoria":"Vehículos y trámites","nombre":"Requisitos para adquirir un seminuevo","keywords":["seminuevo","kilometraje","lima metropolitana","callao","antigüedad","gravamen"],"objetivo":"Explicar los criterios del manual: ámbito de Lima Metropolitana/Callao, kilometraje/antigüedad y ausencia de gravámenes o daños que lo impidan."},
 {"id":"gps","categoria":"Vehículos y trámites","nombre":"GPS, proveedores y uso","keywords":["gps","rastreo","proveedor","garantía gps"],"objetivo":"Orientar sobre el GPS y derivar a FSV/proveedor según el caso; no inventar datos de proveedores."},
 {"id":"gnv_glp","categoria":"Vehículos y trámites","nombre":"Activación de chip GNV/GLP","keywords":["gnv","glp","chip","gas"],"objetivo":"Identificar solicitud y derivar al proveedor/área correspondiente, sin inventar fechas de activación."},
 {"id":"talleres_mantenimiento","categoria":"Vehículos y trámites","nombre":"Talleres, mantenimiento y garantía extendida","keywords":["taller","mantenimiento","falla mecánica","garantía extendida","reparación"],"objetivo":"Distinguir mantenimiento, falla mecánica y garantía; orientar según cobertura documentada."},
 {"id":"impuesto_vehicular","categoria":"Vehículos y trámites","nombre":"Impuesto vehicular","keywords":["impuesto vehicular","municipalidad","tributo vehicular"],"objetivo":"Explicar solo las condiciones descritas en el manual y derivar cuando falte información particular."},
 {"id":"seguro_vehicular","categoria":"Seguros y siniestros","nombre":"Seguro vehicular, pólizas y renovación","keywords":["seguro vehicular","póliza","pacifico","qualitas","rimac","renovación","deducible","soat"],"objetivo":"Identificar aseguradora, orientar sobre SAF y renovaciones/ajustes, y no asegurar coberturas sin revisar póliza."},
 {"id":"siniestro","categoria":"Seguros y siniestros","nombre":"Siniestro parcial, total o robo","keywords":["siniestro","choque","accidente","robo","pérdida total","perito","grúa"],"objetivo":"Indicar denuncia/constancia policial, dosaje etílico, declaración ante aseguradora y reporte máximo a las 4 horas según el manual; con lesionados, comunicarse con SOAT. Para robo, coordinar GPS y denuncia en DIPROVE según manual."},
 {"id":"desgravamen","categoria":"Seguros y siniestros","nombre":"Seguro de desgravamen","keywords":["desgravamen","seguro de vida","persona jurídica","incapacidad"],"objetivo":"Explicar la finalidad y reglas descritas en el manual; no prometer devolución del seguro."},
 {"id":"reclamos","categoria":"Atención y solicitudes","nombre":"Reclamos y portal de reclamos","keywords":["reclamo","libro de reclamaciones","portal","queja"],"objetivo":"Registrar/derivar por el canal de reclamos documentado y explicar el siguiente paso sin inventar plazo de respuesta."},
 {"id":"cambio_ejecutivo","categoria":"Atención y solicitudes","nombre":"Cambio o contacto con ejecutivo/gerencia","keywords":["cambiar ejecutivo","ejecutivo asignado","reunión con gerente","gerente","fidelización","seguros","recuperos"],"objetivo":"Identificar el área correspondiente y compartir datos de contacto solo si están disponibles en el sistema."},
 {"id":"apropiacion_dinero","categoria":"Atención y solicitudes","nombre":"Apropiación de dinero","keywords":["apropiación de dinero","dinero aplicado","pago aplicado"],"objetivo":"Verificar movimiento/tipificación y seguir el procedimiento de llamada específico."},
 {"id":"fallecimiento_sucesion","categoria":"Atención y solicitudes","nombre":"Asociado fallecido y sucesión intestada","keywords":["fallecido","fallecimiento","sucesión","intestada","herederos"],"objetivo":"Tratar el caso con sensibilidad, indicar documentación/proceso que conste y derivar a la unidad responsable."},
 {"id":"debito_automatico","categoria":"Canales y bienvenida","nombre":"Débito automático: afiliación, baja e incidencias","keywords":["débito automático","afiliar","desafiliar","cargo automático","cuenta bancaria"],"objetivo":"Distinguir afiliación, baja o incidencia y seguir el procedimiento específico; no afirmar que quedó activo sin confirmación."},
 {"id":"pandero_casa","categoria":"Pandero Casa","nombre":"Pandero Casa, inmueble e hipoteca","keywords":["pandero casa","hipoteca","inmueble","pagar crédito hipotecario","construcción","propiedad"],"objetivo":"Distinguir compra de inmueble, construcción o cancelación de crédito hipotecario y explicar requisitos/documentos según manual."},
 {"id":"bienvenida","categoria":"Canales y bienvenida","nombre":"Llamada de bienvenida","keywords":["bienvenida","nuevo asociado","reactivado","llamada de bienvenida"],"objetivo":"Confirmar datos y explicar información inicial aplicable, respetando seguridad y el procedimiento de bienvenida."},

 {"id":"transferencia","categoria":"Movimientos contractuales","nombre":"Transferencia de contrato","keywords":["transferencia de contrato","transferir contrato"],"objetivo":"Explicar el procedimiento y los requisitos según persona natural o jurídica; revisar SAF y entregar requisitos vigentes sin asegurar aprobación."},
 {"id":"cambio_titularidad","categoria":"Movimientos contractuales","nombre":"Cambio de titularidad","keywords":["cambio de titularidad","cambiar titular"],"objetivo":"Distinguir el cambio de titularidad de una transferencia y seguir la ruta del manual."},
 {"id":"ampliacion","categoria":"Movimientos contractuales","nombre":"Ampliación de contrato","keywords":["ampliación de contrato","ampliar contrato","extensión de contrato"],"objetivo":"Explicar que requiere revisión de condiciones y derivar al funcionario asignado."},
 {"id":"union_fusion","categoria":"Movimientos contractuales","nombre":"Unión y fusión de contratos","keywords":["unión de contrato","fusión de contrato","fusionar contratos"],"objetivo":"Identificar si se trata de unión o fusión, revisar elegibilidad y derivar al funcionario."},
 {"id":"cuentas_recaudadoras","categoria":"Pagos y contratos","nombre":"Cuentas recaudadoras y formas de pago","keywords":["cuenta recaudadora","dónde pagar","cuenta de pago","servicios varios","cuota mensual","yape","pin"],"objetivo":"Distinguir cuota mensual de servicios varios y explicar los canales indicados por el manual."},
 {"id":"pago_parcial","categoria":"Pagos y contratos","nombre":"Adelanto o pago parcial de cuotas","keywords":["pago parcial","adelantar cuotas","próximas cuotas","últimas cuotas"],"objetivo":"Verificar que no existan cuotas vencidas, distinguir próximas/últimas cuotas y orientar a la solicitud por correo al FSV."},
 {"id":"cancelacion_anticipada","categoria":"Pagos y contratos","nombre":"Cancelación anticipada o pago total","keywords":["cancelación anticipada","pago total","cancelar contrato","pagar todas las cuotas"],"objetivo":"Verificar cuotas vencidas y financiamiento, explicar el cálculo por FSV y el flujo de confirmación y pago."},
 {"id":"reactivacion","categoria":"Movimientos contractuales","nombre":"Reactivación de contrato resuelto","keywords":["reactivación de contrato","reactivar contrato","contrato resuelto"],"objetivo":"Validar si el contrato y el grupo permiten reactivación, explicar costo y derivar al ejecutivo asignado."},
 {"id":"resolucion","categoria":"Movimientos contractuales","nombre":"Resolución de contrato","keywords":["resolución de contrato","resolver contrato"],"objetivo":"Explicar consecuencias de la resolución y verificar elegibilidad; no presentarla como congelamiento del grupo."},
 {"id":"separacion_vacante","categoria":"Devoluciones y retención","nombre":"Separación de vacante","keywords":["separación de vacante","separar vacante"],"objetivo":"Verificar pagos en SAF, informar documentos/canal, plazo de respuesta y forma de devolución según tipo de titular."},
 {"id":"caso_especial","categoria":"Devoluciones y retención","nombre":"Seguimiento de caso especial","keywords":["caso especial","respuesta de mi caso","no estoy conforme con la respuesta"],"objetivo":"Consultar si el caso está ingresado o respondido y seguir el flujo de devolución o disconformidad."},
 {"id":"cambio_ejecutivo_fsv","categoria":"Atención y solicitudes","nombre":"Cambio de funcionario de servicios y ventas","keywords":["cambiar funcionario","cambio de funcionario","cambiar ejecutivo de servicios y ventas"],"objetivo":"Derivar a la línea de reclamos cuando aplique y explicar el canal y plazo documentados."},
 {"id":"cambio_ejecutivo_fidelizacion","categoria":"Atención y solicitudes","nombre":"Cambio de ejecutivo de fidelización/reactivaciones","keywords":["cambiar ejecutivo de fidelización","cambiar ejecutivo de reactivaciones"],"objetivo":"Orientar al correo de atención en línea y plazo de respuesta documentado."},
 {"id":"cita_gerencia","categoria":"Atención y solicitudes","nombre":"Solicitud de cita con gerencia","keywords":["cita con gerente","reunión con la jefa","cita con gerencia"],"objetivo":"Indicar que la solicitud se envía al ejecutivo asignado con copia a Atención en Línea, según manual."},
 {"id":"apropiacion","categoria":"Atención y solicitudes","nombre":"Pago no reflejado / apropiación de dinero","keywords":["pago no figura","pago no reflejado","apropiación de dinero"],"objetivo":"Verificar cuenta, comprobante y SAF; tomar los datos para reporte sin asegurar una aplicación inmediata."},
 {"id":"fallecimiento","categoria":"Atención y solicitudes","nombre":"Fallecimiento y sucesión intestada","keywords":["asociado falleció","fallecimiento del asociado","sucesión intestada","herederos"],"objetivo":"Tratar con sensibilidad y solicitar los documentos legales aplicables; derivar para validación."},
 {"id":"vehiculo_impuesto","categoria":"Vehículos y trámites","nombre":"Inscripción e impuesto vehicular","keywords":["inscripción impuesto vehicular","pago de impuesto vehicular"],"objetivo":"Explicar inscripción, duración y tasa según el manual, validando los datos concretos del vehículo."},
 {"id":"taller_mantenimiento","categoria":"Vehículos y trámites","nombre":"Mantenimiento, talleres y fallas mecánicas","keywords":["mantenimiento del vehículo","taller autorizado","falla mecánica","garantía extendida"],"objetivo":"Diferenciar mantenimiento y falla, orientar al proveedor/taller autorizado y no garantizar cobertura."},
 {"id":"reclamos_registro","categoria":"Atención y solicitudes","nombre":"Registro de reclamo y plazo de respuesta","keywords":["registrar un reclamo","libro de reclamaciones","portal de reclamos"],"objetivo":"Validar que quien reclama sea titular o representante legal; informar canal, plazo y envío de sustentos documentados."},
 {"id":"seguro_propio","categoria":"Seguros y siniestros","nombre":"Seguro vehicular propio y renovación duplicada","keywords":["seguro por cuenta propia","renovaron mi seguro","doble seguro","reajuste de seguro"],"objetivo":"Verificar el caso en SAF y derivar a FSV/aseguradora; no prometer anulación de renovación."},
 {"id":"evaluacion_crediticia","categoria":"Adjudicación y entrega","nombre":"Evaluación crediticia y garantías","keywords":["evaluación crediticia","garante","aval","comité de crédito","documentos para evaluación"],"objetivo":"Explicar por qué se evalúa al adjudicar, documentos generales y plazo indicado en el manual, sujeto a evaluación."},
 {"id":"documentos_entrega","categoria":"Adjudicación y entrega","nombre":"Documentos para notaría, Sunarp y entrega","keywords":["documentos para notaría","documentos para sunarp","documentos para entrega","dua","orden irrevocable"],"objetivo":"Ubicar la fase del proceso y orientar sobre la documentación aplicable a vehículo nuevo o seminuevo."},
 {"id":"compra_inmueble","categoria":"Pandero Casa","nombre":"Compra de inmueble existente","keywords":["comprar inmueble existente","documentos de la propiedad","compraventa"],"objetivo":"Distinguir compra de inmueble, requisitos de propiedad y documentos de firma; derivar la revisión del caso al área responsable."},
 {"id":"cancelar_hipoteca","categoria":"Pandero Casa","nombre":"Uso de contrato para cancelar crédito hipotecario","keywords":["cancelar crédito hipotecario","pagar hipoteca con Pandero Casa","crédito hipotecario"],"objetivo":"Orientar sobre documentos de propiedad y crédito hipotecario y validar el proceso vigente con el área responsable."},
 {"id":"consulta_general","categoria":"Consultas generales","nombre":"Consulta general / otro procedimiento del manual","keywords":[],"objetivo":"Identificar el motivo, usar la guía del manual y consultar SAF/tipificaciones; si falta una regla concreta, no inventarla."}
]

GUIA_CONOCIMIENTO = """
CATÁLOGO TEMÁTICO DEL MANUAL PANDERO:
- Comercial: tentativa de venta, productos Auto nuevo/Seminuevo/Casa, contratos, programas, puntos de venta, ejecutivos, tarifario, firma y copia de contrato.
- Asambleas y adjudicación: duración y dinámica de asambleas, transmisión, sorteo, remate, formas de aplicación y adjudicación anticipada.
- Movimientos contractuales: transferencia, cambio de titularidad, ampliación, financiamiento, adelantos parciales/totales, estado de cuenta de financiamiento, reactivación, resolución, unión/fusión y levantamiento de prenda.
- Pagos: cuentas recaudadoras, cuotas mensuales, servicios varios, estado de cuenta, pago parcial, cancelación anticipada, pagos no reflejados y apropiación de dinero.
- Devoluciones y retención: separación de vacante, devoluciones preinaugurales/postinaugurales, contratos adjudicados, casos especiales, penalidades/descuentos y seguimiento de solicitudes.
- Cobranzas y recuperos: cuotas pendientes, recuperos prejudiciales/judiciales, situación legal, cartas notariales, entrega voluntaria, vehículo capturado, orden de captura y venta extrajudicial.
- Adjudicación y entrega: evaluación crediticia, documentos de persona natural/jurídica, garantías, aval, comité de crédito, pedido vehicular, DUA, notaría, Sunarp, documentos y entrega de vehículos nuevos/seminuevos.
- Vehículos: impuesto vehicular, GPS, proveedores, GNV/GLP, talleres autorizados, mantenimiento, fallas mecánicas y garantía extendida.
- Seguros: seguro vehicular, aseguradoras, póliza en SAF, seguro propio, renovación, ajustes, SOAT, desgravamen, siniestros parciales/totales y robo.
- Atención: reclamos, portal de reclamos, cambio de funcionario/ejecutivo, cita con gerencia, fallecimiento y sucesión intestada.
- Pandero Casa: adquisición de inmueble, construcción, uso del contrato para cancelar crédito hipotecario, documentos de propiedad/hipoteca y firmas.
- Canales: débito automático, afiliación/desafiliación, incidencias y llamada de bienvenida.

REGLAS DE USO:
Este catálogo permite seleccionar escenarios, pero no sustituye el contenido procedimental del PDF que el formador debe cargar en la sesión. Cuando el manual no esté cargado o no contenga un dato, el simulador debe reconocer la limitación y no inventar políticas, importes, fechas, plazos, contactos ni requisitos. Los datos particulares deben verificarse en la ficha del asociado, SAF, póliza o recurso interno correspondiente.
"""
RUBRICA = [
 {"criterio":"Saludo e identificación","maximo":2,"regla":"Saluda profesionalmente, se identifica y mantiene trato adecuado."},
 {"criterio":"Validación de seguridad","maximo":4,"regla":"Solicita/valida los datos necesarios antes de divulgar información protegida; no revela datos antes de confirmar la validación."},
 {"criterio":"Sondeo y comprensión","maximo":2,"regla":"Escucha, identifica el motivo y hace preguntas pertinentes sin interrumpir ni asumir."},
 {"criterio":"Exactitud y cumplimiento del manual","maximo":5,"regla":"Entrega información respaldada por la guía, consulta/indica validar SAF cuando corresponde y no inventa datos, montos, plazos ni políticas."},
 {"criterio":"Procedimiento y derivación","maximo":3,"regla":"Sigue el procedimiento del tema y deriva al área responsable con la información disponible."},
 {"criterio":"Comunicación y empatía","maximo":2,"regla":"Lenguaje claro, respetuoso, natural y sin tecnicismos innecesarios; maneja objeciones con calma."},
 {"criterio":"Cierre y confirmación","maximo":2,"regla":"Confirma si queda alguna consulta, resume el siguiente paso y se despide correctamente."}
]

def normalizar(texto):
    texto = unicodedata.normalize("NFKD", str(texto or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", " ", texto.lower()).strip()

def escenario_por_id(identificador):
    return next((x for x in ESCENARIOS if x["id"] == identificador), None)

def elegir_escenario(motivo=""):
    texto = normalizar(motivo)
    if texto:
        candidatos = []
        for esc in ESCENARIOS:
            puntos = sum(1 for kw in esc["keywords"] if normalizar(kw) in texto)
            if puntos:
                candidatos.append((puntos, esc))
        if candidatos:
            max_puntos = max(x[0] for x in candidatos)
            return random.choice([x[1] for x in candidatos if x[0] == max_puntos])
    return random.choice([x for x in ESCENARIOS if x["id"] != "consulta_general"])

def instrucciones_escenario(escenario):
    return (
        "\nESCENARIO DE ESTA LLAMADA: " + escenario["nombre"] +
        "\nObjetivo de la consulta: " + escenario["objetivo"] +
        "\nGuía temática para el cliente simulado:\n" + GUIA_CONOCIMIENTO +
        "\nLa guía es referencia de contexto para representar un caso real. "
        "El cliente simulado no debe recitarla ni ayudar al asesor. Mantén una "
        "actitud natural acorde al motivo; revela el motivo cuando el asesor "
        "pregunte o encaje naturalmente. Si el perfil no contiene un dato, no "
        "lo inventes. Para preguntas sobre política interna, responde como "
        "cliente según el caso; no te conviertas en el agente ni des la solución."
    )
