export function crearLogger(prefijo) {
  return (mensaje) => console.log(`[${new Date().toISOString()}] [${prefijo}] ${mensaje}`);
}
