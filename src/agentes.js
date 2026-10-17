// Sistema multiagente (arquitectura centralizada de la Hoja 5). Las herramientas ya no se definen aquí:
// cada especialista las obtiene del servidor MCP, filtradas a las que le corresponden.
import { Agent, MCPServerStreamableHttp, createMCPToolStaticFilter } from "@openai/agents";
import { MODELO } from "./config.js";
import { hoyEnGuatemala } from "./servicios/clima.js";

export const MCP_URL = process.env.MCP_URL || "http://localhost:3001/mcp";

const REGLAS_GENERALES = `Trabajas para Parachute S.A., empresa de paracaidismo en Guatemala. Respondes siempre en español, de forma breve y amable.`;

const conFecha = (texto) => () =>
  `${REGLAS_GENERALES}\nHoy es ${hoyEnGuatemala()} (zona horaria de Guatemala).\n\n${texto}`;

function conexionMcp(nombre, herramientas) {
  return new MCPServerStreamableHttp({
    url: MCP_URL,
    name: `mcp_${nombre}`,
    cacheToolsList: true,
    toolFilter: createMCPToolStaticFilter({ allowed: herramientas }),
  });
}

export async function crearSistema() {
  const servidores = {
    faq: conexionMcp("faq", ["buscar_faq"]),
    clima: conexionMcp("clima", ["consultar_clima"]),
    citas: conexionMcp("citas", ["agendar_cita", "consultar_cita"]),
  };
  await Promise.all(Object.values(servidores).map((s) => s.connect()));

  const faq = new Agent({
    name: "agente_faq",
    model: MODELO,
    instructions: conFecha(`Respondes preguntas frecuentes. Usa siempre la herramienta buscar_faq y responde solo con la información que devuelve.
Si la herramienta no encuentra la respuesta, di exactamente: "No cuento con esa información."`),
    mcpServers: [servidores.faq],
  });

  const clima = new Agent({
    name: "agente_clima",
    model: MODELO,
    instructions: conFecha(`Evalúas si una fecha es segura para saltar. Convierte la fecha a YYYY-MM-DD y usa la herramienta consultar_clima.
Reporta el veredicto (IDEAL, MARGINAL o PROHIBIDO), los valores de viento, ráfagas, precipitación, nubosidad y temperatura, y el motivo de cada criterio que no sea ideal.
Si la herramienta devuelve un error (por ejemplo, la fecha supera los 16 días de pronóstico), explícalo tal cual.`),
    mcpServers: [servidores.clima],
  });

  const citas = new Agent({
    name: "agente_citas",
    model: MODELO,
    instructions: conFecha(`Agendas y consultas citas de salto.
Para agendar necesitas nombre, fecha, hora y correo; si falta alguno, pídelo y no llames agendar_cita.
Convierte fechas a YYYY-MM-DD y horas a HH:MM (24 horas).
La herramienta agendar_cita verifica el clima y rechaza días PROHIBIDOS: si rechaza, explica los motivos.
Al confirmar, incluye el identificador (por ejemplo APT_0001), la fecha, la hora y la restricción si existe.`),
    mcpServers: [servidores.citas],
  });

  const supervisor = new Agent({
    name: "supervisor",
    model: MODELO,
    instructions: conFecha(`Eres el supervisor central. No respondes con conocimiento propio: delegas en tus especialistas y redactas la respuesta final.
- Preguntas frecuentes: usa agente_faq.
- Clima o seguridad de una fecha: usa agente_clima.
- Agendar una cita: primero usa agente_clima con la fecha. Si el veredicto es PROHIBIDO o la fecha no es válida, no agendes y explica el motivo. Si es IDEAL o MARGINAL, usa agente_citas con todos los datos del cliente (si es MARGINAL, avisa que solo aplica para tándem experimentado).
- Consultar una cita existente: usa agente_citas.`),
    tools: [
      faq.asTool({ toolName: "agente_faq", toolDescription: "Responde preguntas frecuentes de Parachute S.A." }),
      clima.asTool({ toolName: "agente_clima", toolDescription: "Evalúa si una fecha es segura para saltar según el pronóstico de Open-Meteo." }),
      citas.asTool({ toolName: "agente_citas", toolDescription: "Agenda o consulta citas de salto. Envía nombre, fecha, hora y correo." }),
    ],
  });

  const cerrar = () => Promise.all(Object.values(servidores).map((s) => s.close()));
  return { supervisor, especialistas: [faq, clima, citas], cerrar };
}
