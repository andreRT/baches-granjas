async function consultarApi(rutas, opciones = {}) {
  const respuestaHttp = await fetch(`/api${rutas}`, {
    credentials: 'same-origin',
    ...opciones,
    headers: {
      ...(!(opciones.body instanceof FormData) && opciones.body ? {
        'Content-Type': 'application/json'
      } : {}),
      ...opciones.headers
    }
  });
  if (respuestaHttp.status === 204) return null;
  const datos = await respuestaHttp.json().catch(() => ({}));
  if (!respuestaHttp.ok) {
    if (respuestaHttp.status === 401 && !rutas.startsWith("/autenticacion/")) window.dispatchEvent(new Event("session-expired"));
    throw new Error(datos.error || "No se pudo conectar con el servidor.");
  }
  return datos;
}
export { consultarApi };
const formatearFecha = valor => new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeZone: "America/Mexico_City"
}).format(new Date(valor));
export { formatearFecha };
const formatearFechaHora = valor => new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City"
}).format(new Date(valor));
export { formatearFechaHora };
