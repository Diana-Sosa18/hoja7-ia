import { test } from "node:test";
import assert from "node:assert/strict";
import { validarFecha, obtenerPronostico, SITIO_ATERRIZAJE } from "../src/servicios/clima.js";
import { crearServicioCitas } from "../src/servicios/citas.js";
import { buscarFaq } from "../src/servicios/faqs.js";

const HOY = "2026-10-05";

test("validarFecha acepta hoy y hasta 15 días adelante (16 días de pronóstico)", () => {
  assert.equal(validarFecha("2026-10-05", HOY).valida, true);
  assert.equal(validarFecha("2026-10-20", HOY).valida, true);
});

test("validarFecha rechaza fechas pasadas, fuera de pronóstico y mal formadas", () => {
  assert.match(validarFecha("2026-10-04", HOY).error, /ya pasó/);
  assert.match(validarFecha("2026-10-21", HOY).error, /16 días.*2026-10-20/);
  assert.match(validarFecha("21/10/2026", HOY).error, /YYYY-MM-DD/);
});

test("obtenerPronostico pide las coordenadas y variables de la hoja a Open-Meteo", async () => {
  let urlPedida;
  const fetchFn = async (url) => {
    urlPedida = new URL(url);
    return {
      ok: true,
      json: async () => ({
        daily: {
          temperature_2m_max: [30],
          precipitation_sum: [0],
          cloud_cover_mean: [20],
          wind_speed_10m_max: [12],
          wind_gusts_10m_max: [25],
        },
      }),
    };
  };
  const p = await obtenerPronostico("2026-10-10", { fetchFn });
  assert.equal(urlPedida.searchParams.get("latitude"), String(SITIO_ATERRIZAJE.latitud));
  assert.equal(urlPedida.searchParams.get("longitude"), String(SITIO_ATERRIZAJE.longitud));
  for (const v of ["wind_gusts_10m", "temperature_2m", "precipitation", "cloud_cover", "wind_speed_10m"]) {
    assert.match(urlPedida.searchParams.get("daily"), new RegExp(v));
  }
  assert.deepEqual(p, {
    fecha: "2026-10-10",
    temperatura_c: 30,
    precipitacion_mm: 0,
    nubosidad_pct: 20,
    viento_kmh: 12,
    rafagas_kmh: 25,
  });
});

const climaFalso = (resultado) => async () => resultado;
const DATOS = { nombre: "Ana López", fecha: "2026-10-10", hora: "10:00", correo: "ana@example.com" };

test("agendarCita confirma en día apto y guarda la restricción de un día marginal", async () => {
  const servicio = crearServicioCitas({
    evaluarClima: climaFalso({ apto: true, veredicto: "MARGINAL", restriccion: "Solo tándem experimentado", detalle: [] }),
  });
  const r = await servicio.agendarCita(DATOS);
  assert.equal(r.exito, true);
  assert.equal(r.id_cita, "APT_0001");
  assert.equal(r.restriccion, "Solo tándem experimentado");
  assert.equal(servicio.consultarCita("APT_0001").nombre, "Ana López");
});

test("agendarCita rechaza un día PROHIBIDO aunque el agente lo intente", async () => {
  const servicio = crearServicioCitas({
    evaluarClima: climaFalso({
      apto: false,
      veredicto: "PROHIBIDO",
      detalle: [{ nivel: "PROHIBIDO", motivo: "Saltar con lluvia daña el equipo y lastima la piel" }],
    }),
  });
  const r = await servicio.agendarCita(DATOS);
  assert.equal(r.exito, false);
  assert.deepEqual(r.motivos, ["Saltar con lluvia daña el equipo y lastima la piel"]);
});

test("agendarCita rechaza fechas fuera de pronóstico y datos incompletos", async () => {
  const servicio = crearServicioCitas({ evaluarClima: climaFalso({ error: "Open-Meteo solo provee 16 días" }) });
  assert.match((await servicio.agendarCita(DATOS)).error, /16 días/);
  assert.match((await servicio.agendarCita({ ...DATOS, correo: "sin-arroba" })).error, /correo/);
  assert.match((await servicio.agendarCita({ ...DATOS, hora: "19:00" })).error, /08:00 y 16:00/);
});

test("buscarFaq encuentra sinónimos y no inventa respuestas", () => {
  assert.equal(buscarFaq("¿Puedo tener la consulta por videollamada?").pregunta, "¿Ofrecen consultas virtuales?");
  assert.equal(buscarFaq("¿Dónde quedan sus oficinas?").pregunta, "¿Dónde están ubicados?");
  assert.equal(buscarFaq("¿Cómo se llama el gerente general?").encontrada, false);
});
