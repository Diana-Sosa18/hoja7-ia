import { evaluarCondiciones } from "./criterios.js";

export const SITIO_ATERRIZAJE = { latitud: 14.013722, longitud: -90.771611 };
export const DIAS_PRONOSTICO = 16;
const ZONA_HORARIA = "America/Guatemala";
const URL_OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

const VARIABLES_DIARIAS = {
  temperatura_c: "temperature_2m_max",
  precipitacion_mm: "precipitation_sum",
  nubosidad_pct: "cloud_cover_mean",
  viento_kmh: "wind_speed_10m_max",
  rafagas_kmh: "wind_gusts_10m_max",
};

const DIA_MS = 24 * 60 * 60 * 1000;

export function hoyEnGuatemala(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(ahora);
}

function sumarDias(fecha, dias) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

export function validarFecha(fecha, hoy = hoyEnGuatemala()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) {
    return { valida: false, error: "La fecha debe tener formato YYYY-MM-DD." };
  }
  const dias = Math.round((Date.parse(fecha) - Date.parse(hoy)) / DIA_MS);
  if (dias < 0) {
    return { valida: false, error: `La fecha ${fecha} ya pasó. Hoy es ${hoy}.` };
  }
  if (dias >= DIAS_PRONOSTICO) {
    const limite = sumarDias(hoy, DIAS_PRONOSTICO - 1);
    return {
      valida: false,
      error: `No se puede agendar para ${fecha}: Open-Meteo solo provee ${DIAS_PRONOSTICO} días de pronóstico. La fecha máxima es ${limite}.`,
    };
  }
  return { valida: true };
}

export async function obtenerPronostico(fecha, { fetchFn = fetch } = {}) {
  const params = new URLSearchParams({
    latitude: SITIO_ATERRIZAJE.latitud,
    longitude: SITIO_ATERRIZAJE.longitud,
    daily: Object.values(VARIABLES_DIARIAS).join(","),
    timezone: ZONA_HORARIA,
    start_date: fecha,
    end_date: fecha,
  });
  const respuesta = await fetchFn(`${URL_OPEN_METEO}?${params}`);
  if (!respuesta.ok) {
    throw new Error(`Open-Meteo respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
  const { daily } = await respuesta.json();
  const pronostico = { fecha };
  for (const [nombre, variable] of Object.entries(VARIABLES_DIARIAS)) {
    pronostico[nombre] = daily[variable][0];
  }
  return pronostico;
}

export async function evaluarClimaParaFecha(fecha, opciones = {}) {
  const validacion = validarFecha(fecha, opciones.hoy);
  if (!validacion.valida) {
    return { fecha, error: validacion.error };
  }
  const pronostico = await obtenerPronostico(fecha, opciones);
  return { fecha, pronostico, ...evaluarCondiciones(pronostico) };
}
