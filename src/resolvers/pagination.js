/**
 * Calcula el proximo startAt para paginar /rest/api/3/workflows/search.
 * Jira limita maxResults a 50 por pagina en este endpoint pase lo que se pida (confirmado en vivo,
 * 2026-11-17: pidiendo 100 se recibieron 50) -- avanzar por el tamano PEDIDO en vez del tamano REAL
 * de la pagina salta registros. Si la pagina viene vacia pero isLast=false (no deberia pasar, pero
 * evita un loop infinito), avanza por requestedPageSize igual.
 */
function nextStartAt(startAt, pageValuesLength, requestedPageSize) {
  return startAt + (pageValuesLength || requestedPageSize);
}

export { nextStartAt };
