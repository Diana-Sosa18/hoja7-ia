export const NIVELES = {
  IDEAL: "IDEAL",
  MARGINAL: "MARGINAL",
  PROHIBIDO: "PROHIBIDO",
};

const GRAVEDAD = { IDEAL: 0, MARGINAL: 1, PROHIBIDO: 2 };

export const CRITERIOS = [
  {
    variable: "viento_kmh",
    nombre: "Velocidad del viento en superficie",
    unidad: "km/h",
    evaluar(v) {
      if (v > 28) return [NIVELES.PROHIBIDO, "Mayor a 28 km/h: muy difícil de controlar el salto"];
      if (v >= 20) return [NIVELES.MARGINAL, "Entre 20 y 28 km/h: solo tándem experimentado"];
      return [NIVELES.IDEAL, "Menor a 20 km/h"];
    },
  },
  {
    variable: "rafagas_kmh",
    nombre: "Ráfagas de viento",
    unidad: "km/h",
    evaluar(v) {
      if (v > 35) return [NIVELES.PROHIBIDO, "Ráfagas mayores a 35 km/h"];
      return [NIVELES.IDEAL, "Ráfagas de hasta 35 km/h"];
    },
  },
  {
    variable: "precipitacion_mm",
    nombre: "Precipitación",
    unidad: "mm",
    evaluar(v) {
      if (v > 0) return [NIVELES.PROHIBIDO, "Saltar con lluvia daña el equipo y lastima la piel"];
      return [NIVELES.IDEAL, "Sin lluvia"];
    },
  },
  {
    variable: "nubosidad_pct",
    nombre: "Cobertura de nubes / visibilidad",
    unidad: "%",
    evaluar(v) {
      if (v > 75) return [NIVELES.PROHIBIDO, "Techo de nubes bajo: impide las reglas de vuelo visual"];
      if (v >= 30) return [NIVELES.MARGINAL, "Nubes dispersas"];
      return [NIVELES.IDEAL, "Visibilidad clara"];
    },
  },
];

export function evaluarCondiciones(pronostico, criterios = CRITERIOS) {
  const detalle = criterios.map((c) => {
    const valor = pronostico[c.variable];
    const [nivel, motivo] = c.evaluar(valor);
    return { criterio: c.nombre, valor, unidad: c.unidad, nivel, motivo };
  });
  const veredicto = detalle.reduce(
    (peor, d) => (GRAVEDAD[d.nivel] > GRAVEDAD[peor] ? d.nivel : peor),
    NIVELES.IDEAL
  );
  return {
    veredicto,
    apto: veredicto !== NIVELES.PROHIBIDO,
    restriccion: veredicto === NIVELES.MARGINAL ? "Solo tándem experimentado" : null,
    detalle,
  };
}
