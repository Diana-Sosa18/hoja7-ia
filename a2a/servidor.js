// Servidor A2A: expone el sistema multiagente de Parachute S.A. como un solo agente con sus skills.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import { Runner } from "@openai/agents";
import { AGENT_CARD_PATH, Role, TaskState } from "@a2a-js/sdk";
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { crearSistema, MCP_URL } from "../src/agentes.js";
import { crearLogger } from "../src/logger.js";

const PUERTO = Number(process.env.A2A_PORT || 4000);
const URL_BASE = `http://localhost:${PUERTO}`;
const log = crearLogger("A2A");

const tarjeta = {
  name: "Asistente Parachute S.A.",
  description:
    "Asistente de Parachute S.A. (paracaidismo en Guatemala). Responde preguntas frecuentes, evalúa el clima del sitio de aterrizaje y agenda saltos solo si el clima es seguro.",
  version: "1.0.0",
  provider: { organization: "Parachute S.A.", url: "https://parachute.example.com" },
  supportedInterfaces: [
    { url: `${URL_BASE}/a2a/jsonrpc`, protocolBinding: "JSONRPC", protocolVersion: "1.0", tenant: "" },
  ],
  capabilities: { streaming: true, pushNotifications: false, extensions: [] },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  signatures: [],
  skills: [
    {
      id: "preguntas_frecuentes",
      name: "Preguntas frecuentes",
      description: "Responde sobre horario, costo, consultas virtuales, cancelación, ubicación y formas de pago.",
      tags: ["faq", "informacion"],
      examples: ["¿Cuál es el horario de atención?", "¿Qué formas de pago aceptan?"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
      securityRequirements: [],
    },
    {
      id: "evaluar_clima",
      name: "Evaluar clima para saltar",
      description:
        "Consulta el pronóstico de Open-Meteo del sitio de aterrizaje y clasifica el día como IDEAL, MARGINAL o PROHIBIDO (máximo 16 días).",
      tags: ["clima", "seguridad"],
      examples: ["¿Es seguro saltar mañana?"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
      securityRequirements: [],
    },
    {
      id: "agendar_citas",
      name: "Agendar y consultar citas",
      description: "Agenda saltos (nombre, fecha, hora y correo) solo si el clima es seguro y consulta citas por su identificador.",
      tags: ["citas", "reservas"],
      examples: ["Quiero agendar un salto el viernes a las 10:00, soy Ana López, ana@example.com", "¿Cuál es mi cita APT_0001?"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
      securityRequirements: [],
    },
  ],
};

const textoDe = (mensaje) =>
  (mensaje?.parts ?? [])
    .filter((p) => p.content?.$case === "text")
    .map((p) => p.content.value)
    .join("\n");

const mensajeAgente = (texto, taskId, contextId) => ({
  messageId: randomUUID(),
  role: Role.ROLE_AGENT,
  parts: [{ content: { $case: "text", value: texto }, metadata: undefined, filename: "", mediaType: "text/plain" }],
  taskId,
  contextId,
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
});

const estado = (taskId, contextId, state, texto) =>
  AgentEvent.statusUpdate({
    taskId,
    contextId,
    status: {
      state,
      message: texto ? mensajeAgente(texto, taskId, contextId) : undefined,
      timestamp: new Date().toISOString(),
    },
    metadata: undefined,
  });

class ParachuteExecutor {
  constructor(sistema) {
    this.sistema = sistema;
    // Historial de la conversación por contextId, para que el cliente mantenga el hilo entre mensajes.
    this.historiales = new Map();
  }

  async execute(contexto, bus) {
    const { taskId, contextId, userMessage } = contexto;
    const texto = textoDe(userMessage);
    log(`tarea ${taskId.slice(0, 8)} (contexto ${contextId.slice(0, 8)}) recibida: "${texto}"`);

    if (!contexto.task) {
      bus.publish(
        AgentEvent.task({
          id: taskId,
          contextId,
          status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: new Date().toISOString() },
          artifacts: [],
          history: [userMessage],
          metadata: undefined,
        })
      );
    }
    bus.publish(estado(taskId, contextId, TaskState.TASK_STATE_WORKING, "Procesando la solicitud..."));

    const runner = new Runner();
    runner.on("agent_tool_start", (_ctx, agente, herramienta) => {
      log(`  ${agente.name} → ${herramienta.name}`);
      bus.publish(estado(taskId, contextId, TaskState.TASK_STATE_WORKING, `${agente.name} → ${herramienta.name}`));
    });

    try {
      const historial = this.historiales.get(contextId) ?? [];
      const resultado = await runner.run(this.sistema.supervisor, [...historial, { role: "user", content: texto }]);
      this.historiales.set(contextId, resultado.history);
      const respuesta = String(resultado.finalOutput ?? "");
      log(`tarea ${taskId.slice(0, 8)} completada: "${respuesta.slice(0, 200).replace(/\s+/g, " ")}"`);
      bus.publish(estado(taskId, contextId, TaskState.TASK_STATE_COMPLETED, respuesta));
    } catch (error) {
      log(`tarea ${taskId.slice(0, 8)} falló: ${error.message}`);
      bus.publish(estado(taskId, contextId, TaskState.TASK_STATE_FAILED, `Error: ${error.message}`));
    } finally {
      bus.finished();
    }
  }

  async cancelTask(taskId, bus) {
    log(`cancelación solicitada para la tarea ${taskId.slice(0, 8)}`);
    bus.finished();
  }
}

const sistema = await crearSistema();
log(`Sistema multiagente conectado al servidor MCP ${MCP_URL}`);

// Logs del trabajo interno de los especialistas (las herramientas que llaman por MCP).
for (const agente of sistema.especialistas) {
  agente.on("agent_tool_start", (_ctx, herramienta) => log(`    ${agente.name} → ${herramienta.name} (MCP)`));
}

const manejador = new DefaultRequestHandler(tarjeta, new InMemoryTaskStore(), new ParachuteExecutor(sistema));

const app = express();
app.use((req, _res, next) => {
  log(`${req.method} ${req.path}`);
  next();
});
app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: manejador }));
app.use("/a2a/jsonrpc", jsonRpcHandler({ requestHandler: manejador, userBuilder: UserBuilder.noAuthentication }));

const servidorHttp = app.listen(PUERTO, () => {
  log(`Servidor A2A escuchando en ${URL_BASE}`);
  log(`Agent Card: ${URL_BASE}/${AGENT_CARD_PATH}`);
  log(`Skills: ${tarjeta.skills.map((s) => s.id).join(", ")}`);
});

process.on("SIGINT", async () => {
  servidorHttp.close();
  await sistema.cerrar();
  process.exit(0);
});
