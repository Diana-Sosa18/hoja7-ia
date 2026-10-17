export const FAQS = [
  {
    pregunta: "¿Cuál es el horario de atención?",
    respuesta: "Atendemos de lunes a viernes de 9:00 a 18:00.",
    claves: "horario horarios abren cierran atienden atencion",
  },
  {
    pregunta: "¿Cuál es el costo de la consulta?",
    respuesta: "El costo de la consulta es de Q250 por sesión.",
    claves: "costo cuesta precio valor tarifa",
  },
  {
    pregunta: "¿Ofrecen consultas virtuales?",
    respuesta: "Sí, ofrecemos consultas presenciales y virtuales por videollamada.",
    claves: "virtual virtuales videollamada linea remota remoto zoom meet distancia",
  },
  {
    pregunta: "¿Cuál es la política de cancelación?",
    respuesta:
      "Las citas se pueden cancelar sin costo con al menos 24 horas de anticipación. Cancelaciones con menos tiempo tienen un cargo de Q100.",
    claves: "cancelar cancelo cancelacion cancelaciones anular reprogramar",
  },
  {
    pregunta: "¿Dónde están ubicados?",
    respuesta: "Estamos en 5a. Avenida 10-50, Zona 10, Ciudad de Guatemala.",
    claves: "ubicados ubicacion direccion oficinas oficina quedan encuentran llegar",
  },
  {
    pregunta: "¿Qué formas de pago aceptan?",
    respuesta: "Aceptamos efectivo, tarjeta de crédito o débito y transferencia bancaria.",
    claves: "pago pagar pagos tarjeta efectivo transferencia",
  },
];

const PALABRAS_VACIAS = new Set([
  "cual", "como", "donde", "cuando", "que", "para", "por", "con", "una", "las", "los",
  "del", "ustedes", "tienen", "hay", "son", "esta", "este", "sus", "nos",
]);

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !PALABRAS_VACIAS.has(p));
}

export function buscarFaq(pregunta, faqs = FAQS) {
  const palabras = new Set(normalizar(pregunta));
  let mejor = null;
  let mejorPuntaje = 0;
  for (const faq of faqs) {
    const texto = new Set(normalizar(`${faq.pregunta} ${faq.respuesta}`));
    const claves = new Set(normalizar(faq.claves));
    let puntaje = 0;
    for (const p of palabras) {
      if (claves.has(p)) puntaje += 2;
      else if (texto.has(p)) puntaje += 1;
    }
    if (puntaje > mejorPuntaje) {
      mejor = faq;
      mejorPuntaje = puntaje;
    }
  }
  if (!mejor) {
    return { encontrada: false, mensaje: "La pregunta no está en la base de preguntas frecuentes." };
  }
  return { encontrada: true, pregunta: mejor.pregunta, respuesta: mejor.respuesta };
}
