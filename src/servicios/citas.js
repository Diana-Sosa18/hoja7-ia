import { evaluarClimaParaFecha } from "./clima.js";

export function crearServicioCitas({ evaluarClima = evaluarClimaParaFecha } = {}) {
  const citas = new Map();

  async function agendarCita({ nombre, fecha, hora, correo }) {
    if (!nombre?.trim()) {
      return { exito: false, error: "Falta el nombre del cliente." };
    }
    if (!/^\d{2}:\d{2}$/.test(hora ?? "")) {
      return { exito: false, error: "La hora debe tener formato HH:MM." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo ?? "")) {
      return { exito: false, error: "El correo electrónico no es válido." };
    }
    if (hora < "08:00" || hora > "16:00") {
      return { exito: false, error: "Los saltos se programan entre 08:00 y 16:00." };
    }
    const ocupada = [...citas.values()].some((c) => c.fecha === fecha && c.hora === hora);
    if (ocupada) {
      return { exito: false, error: "Ese horario ya está ocupado." };
    }

    const clima = await evaluarClima(fecha);
    if (clima.error) {
      return { exito: false, error: clima.error };
    }
    if (!clima.apto) {
      const motivos = clima.detalle.filter((d) => d.nivel === "PROHIBIDO").map((d) => d.motivo);
      return { exito: false, error: "El clima no es seguro para saltar ese día.", motivos, clima };
    }

    const id = `APT_${String(citas.size + 1).padStart(4, "0")}`;
    const cita = { id_cita: id, nombre, fecha, hora, correo, restriccion: clima.restriccion };
    citas.set(id, cita);
    return { exito: true, ...cita, clima: { veredicto: clima.veredicto, pronostico: clima.pronostico } };
  }

  function consultarCita(idCita) {
    const cita = citas.get(idCita);
    return cita ? { exito: true, ...cita } : { exito: false, error: `No existe la cita ${idCita}.` };
  }

  return { agendarCita, consultarCita };
}
