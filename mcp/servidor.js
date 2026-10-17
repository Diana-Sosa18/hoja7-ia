// Servidor MCP de Parachute S.A.: expone las herramientas de todos los agentes con transporte Streamable HTTP.
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import { buscarFaq } from "../src/servicios/faqs.js";
import { evaluarClimaParaFecha } from "../src/servicios/clima.js";
import { crearServicioCitas } from "../src/servicios/citas.js";
import { crearLogger } from "../src/logger.js";

const PUERTO = Number(process.env.MCP_PORT || 3001);
const log = crearLogger("MCP");

// Las citas viven en el servidor y se comparten entre todas las sesiones de clientes.
const citas = crearServicioCitas();

// Envuelve cada herramienta para emitir un log de entrada, salida y duración.
function conLog(nombre, fn) {
  return async (argumentos) => {
    const inicio = Date.now();
    log(`→ ${nombre} ${JSON.stringify(argumentos)}`);
    try {
      const resultado = await fn(argumentos);
      log(`← ${nombre} (${Date.now() - inicio} ms) ${JSON.stringify(resultado).slice(0, 300)}`);
      return {
        content: [{ type: "text", text: JSON.stringify(resultado) }],
      };
    } catch (error) {
      log(`✗ ${nombre} (${Date.now() - inicio} ms) ${error.message}`);
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  };
}

function crearServidorMcp() {
  const servidor = new McpServer({ name: "parachute-herramientas", version: "1.0.0" });

  servidor.registerTool(
    "buscar_faq",
    {
      title: "Buscar pregunta frecuente",
      description:
        "Busca la respuesta oficial a una pregunta frecuente (horario, costo, consultas virtuales, cancelación, ubicación, formas de pago).",
      inputSchema: { pregunta: z.string().describe("Pregunta del cliente") },
    },
    conLog("buscar_faq", ({ pregunta }) => buscarFaq(pregunta))
  );

  servidor.registerTool(
    "consultar_clima",
    {
      title: "Consultar clima",
      description:
        "Consulta el pronóstico de Open-Meteo para el lugar de aterrizaje y evalúa si el día es IDEAL, MARGINAL o PROHIBIDO para saltar. Solo hay pronóstico para los próximos 16 días.",
      inputSchema: { fecha: z.string().describe("Fecha en formato YYYY-MM-DD") },
    },
    conLog("consultar_clima", ({ fecha }) => evaluarClimaParaFecha(fecha))
  );

  servidor.registerTool(
    "agendar_cita",
    {
      title: "Agendar cita",
      description:
        "Agenda un salto. Verifica el clima internamente y rechaza la cita si el día es PROHIBIDO. Requiere nombre, fecha, hora y correo.",
      inputSchema: {
        nombre: z.string().describe("Nombre completo del cliente"),
        fecha: z.string().describe("Fecha en formato YYYY-MM-DD"),
        hora: z.string().describe("Hora en formato HH:MM de 24 horas"),
        correo: z.string().describe("Correo electrónico del cliente"),
      },
    },
    conLog("agendar_cita", (datos) => citas.agendarCita(datos))
  );

  servidor.registerTool(
    "consultar_cita",
    {
      title: "Consultar cita",
      description: "Consulta una cita existente por su identificador, por ejemplo APT_0001.",
      inputSchema: { id_cita: z.string().describe("Identificador de la cita") },
    },
    conLog("consultar_cita", ({ id_cita }) => citas.consultarCita(id_cita))
  );

  return servidor;
}

const app = createMcpExpressApp();

// Modo sin estado: cada petición HTTP crea su propio servidor y transporte Streamable HTTP.
app.post("/mcp", async (req, res) => {
  const servidor = crearServidorMcp();
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transporte.close();
    servidor.close();
  });
  if (req.body?.method && req.body.method !== "tools/call") log(`petición ${req.body.method}`);
  try {
    await servidor.connect(transporte);
    await transporte.handleRequest(req, res, req.body);
  } catch (error) {
    log(`error al atender la petición: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Error interno" }, id: null });
    }
  }
});

const noPermitido = (req, res) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Método no permitido" }, id: null });
app.get("/mcp", noPermitido);
app.delete("/mcp", noPermitido);

app.listen(PUERTO, () => {
  log(`Servidor MCP (Streamable HTTP) escuchando en http://localhost:${PUERTO}/mcp`);
  log("Herramientas: buscar_faq, consultar_clima, agendar_cita, consultar_cita");
});
