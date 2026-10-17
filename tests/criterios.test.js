import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarCondiciones, NIVELES } from "../src/servicios/criterios.js";

const base = { viento_kmh: 10, rafagas_kmh: 20, precipitacion_mm: 0, nubosidad_pct: 10, temperatura_c: 28 };
const evaluar = (cambios) => evaluarCondiciones({ ...base, ...cambios });
const nivelDe = (resultado, criterio) => resultado.detalle.find((d) => d.criterio.startsWith(criterio)).nivel;

test("día con todas las condiciones ideales", () => {
  const r = evaluar({});
  assert.equal(r.veredicto, NIVELES.IDEAL);
  assert.equal(r.apto, true);
  assert.equal(r.restriccion, null);
});

test("velocidad del viento: límites 20 y 28 km/h", () => {
  assert.equal(nivelDe(evaluar({ viento_kmh: 19.9 }), "Velocidad"), NIVELES.IDEAL);
  assert.equal(nivelDe(evaluar({ viento_kmh: 20 }), "Velocidad"), NIVELES.MARGINAL);
  assert.equal(nivelDe(evaluar({ viento_kmh: 28 }), "Velocidad"), NIVELES.MARGINAL);
  assert.equal(nivelDe(evaluar({ viento_kmh: 28.1 }), "Velocidad"), NIVELES.PROHIBIDO);
});

test("ráfagas mayores a 35 km/h prohíben el salto", () => {
  assert.equal(evaluar({ rafagas_kmh: 35 }).apto, true);
  assert.equal(evaluar({ rafagas_kmh: 35.1 }).veredicto, NIVELES.PROHIBIDO);
});

test("cualquier precipitación prohíbe el salto", () => {
  assert.equal(evaluar({ precipitacion_mm: 0.1 }).veredicto, NIVELES.PROHIBIDO);
});

test("nubosidad: límites 30 y 75 %", () => {
  assert.equal(nivelDe(evaluar({ nubosidad_pct: 29 }), "Cobertura"), NIVELES.IDEAL);
  assert.equal(nivelDe(evaluar({ nubosidad_pct: 30 }), "Cobertura"), NIVELES.MARGINAL);
  assert.equal(nivelDe(evaluar({ nubosidad_pct: 75 }), "Cobertura"), NIVELES.MARGINAL);
  assert.equal(nivelDe(evaluar({ nubosidad_pct: 76 }), "Cobertura"), NIVELES.PROHIBIDO);
});

test("el veredicto es el peor nivel y marginal implica tándem experimentado", () => {
  const r = evaluar({ viento_kmh: 22, nubosidad_pct: 50 });
  assert.equal(r.veredicto, NIVELES.MARGINAL);
  assert.equal(r.apto, true);
  assert.equal(r.restriccion, "Solo tándem experimentado");
  assert.equal(evaluar({ viento_kmh: 22, precipitacion_mm: 2 }).veredicto, NIVELES.PROHIBIDO);
});
