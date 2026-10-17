// Interfaz de terminal que se comporta como cliente A2A del asistente de Parachute S.A.
import "dotenv/config";
import readline from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { Role, TaskState } from "@a2a-js/sdk";
import { ClientFactory } from "@a2a-js/sdk/client";

const URL_AGENTE = process.env.A2A_URL || "http://localhost:4000";

const textoDe = (mensaje) =>
  (mensaje?.parts ?? [])
    .filter((p) => p.content?.$case === "text")
    .map((p) => p.content.value)
    .join("\n");

const cliente = await new ClientFactory().createFromUrl(URL_AGENTE);
const tarjeta = await cliente.getAgentCard();

// El contextId lo asigna el servidor en la primera respuesta y se reutiliza para mantener la conversación.
let contextId = "";

async function enviar(texto) {
  const mensaje = {
    messageId: randomUUID(),
    role: Role.ROLE_USER,
    parts: [{ content: { $case: "text", value: texto }, metadata: undefined, filename: "", mediaType: "text/plain" }],
    contextId,
    taskId: "",
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };

  let respuesta = "";
  const flujo = cliente.sendMessageStream({ tenant: "", message: mensaje, configuration: undefined, metadata: undefined });
  for await (const evento of flujo) {
    const { $case, value } = evento.payload ?? {};
    if (value?.contextId) contextId = value.contextId;
    if ($case === "message") {
      respuesta = textoDe(value);
    } else if ($case === "statusUpdate" || $case === "task") {
      const { state, message } = value.status ?? {};
      if (state === TaskState.TASK_STATE_WORKING && message) {
        console.log(`  [${textoDe(message)}]`);
      } else if (state === TaskState.TASK_STATE_COMPLETED || state === TaskState.TASK_STATE_FAILED) {
        respuesta = textoDe(message);
      }
    }
  }
  console.log(`\n${tarjeta.name}: ${respuesta}\n`);
}

console.log(`Conectado a "${tarjeta.name}" (${URL_AGENTE}) mediante A2A.`);
console.log(`Skills: ${tarjeta.skills.map((s) => s.name).join(", ")}`);

const mensajeInicial = process.argv.slice(2).join(" ");
if (mensajeInicial) {
  await enviar(mensajeInicial);
} else {
  console.log('Escribe "salir" para terminar.\n');
  const rl = readline.createInterface({ input: process.stdin });
  const preguntar = () => process.stdout.write("Tú: ");
  preguntar();
  for await (const linea of rl) {
    const texto = linea.trim();
    if (!texto || texto.toLowerCase() === "salir") break;
    try {
      await enviar(texto);
    } catch (error) {
      console.error(`Error: ${error.message}\n`);
    }
    preguntar();
  }
  rl.close();
}
