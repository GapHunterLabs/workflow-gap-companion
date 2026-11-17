// Tipos de transicion confirmados contra el spec real de GET /rest/api/3/workflows/search:
// "INITIAL" (crea el issue, su toStatusReference es el estado inicial), "GLOBAL" (disponible desde
// cualquier estado, cubre la salida de todo el workflow), "DIRECTED" (de un estado puntual a otro).
const GLOBAL = 'GLOBAL';

// Probado en vivo contra un sitio real (2026-11-17): sin este filtro, todo estado categoria "done"
// (Done, Closed, Resolved...) salia marcado "SIN SALIDA" -- falso positivo, un estado terminal se
// supone que no tiene transicion de salida, eso no es un bug. Solo cuenta como callejon real un
// estado que NO es terminal (categoria "new" o "indeterminate") y no tiene por donde salir.
const DONE_CATEGORY = 'done';

/**
 * Arma el grafo de un workflow a partir de sus transiciones y marca tres tipos de problema:
 * - sin entrada (unreachable): ninguna transicion lleva a este estado.
 * - sin salida (dead-end): ningun estado no-terminal con 0 transiciones de salida y sin GLOBAL que lo cubra.
 * - atrapado en un ciclo (trapped): tiene entrada y salida, pero ningun camino desde el lleva a un
 *   estado terminal -- ej. dos estados que solo se transicionan entre si. El chequeo de grado
 *   (sin entrada/sin salida) NO detecta esto: ambos nodos tienen grado > 0. Hace falta un
 *   alcanzabilidad real (DFS) hasta algun estado categoria "done". Pedido explicito del usuario
 *   (2026-11-17) tras revisar la lista de casos de prueba recomendados -- hueco real de v1, no solo
 *   un caso de prueba que faltaba.
 *
 * El origen de una transicion NO viene en un campo "from" (eso es el endpoint deprecado) -- viene en
 * links[].fromStatusReference, confirmado contra el spec real. Una transicion GLOBAL no trae links
 * (esta disponible "desde cualquier estado" sin un origen puntual) -- se modela conectando cada nodo
 * conocido hacia el destino de la GLOBAL, tanto para el chequeo de grado como para el de alcanzabilidad.
 *
 * Sin dependencias de @forge/* a proposito: se puede probar con node plano, sin simular el runtime
 * de Forge (ver findGaps.test.mjs).
 */
function findGaps(workflow, statusCategoryByRef) {
  const transitions = workflow.transitions || [];
  const hasGlobalExit = transitions.some((t) => t.type === GLOBAL);

  const allRefs = new Set((workflow.statuses || []).map((s) => s.statusReference).filter(Boolean));
  const hasIncoming = new Set();
  const hasOutgoing = new Set();
  const adjacency = new Map(); // ref -> Set(refs alcanzables en un salto directo)
  const globalTargets = new Set();

  const addEdge = (from, to) => {
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
  };

  for (const t of transitions) {
    if (t.toStatusReference) {
      allRefs.add(t.toStatusReference);
      hasIncoming.add(t.toStatusReference);
    }
    const froms = [];
    for (const link of t.links || []) {
      if (link.fromStatusReference) {
        allRefs.add(link.fromStatusReference);
        hasOutgoing.add(link.fromStatusReference);
        froms.push(link.fromStatusReference);
      }
    }
    if (t.type === GLOBAL && t.toStatusReference) {
      globalTargets.add(t.toStatusReference);
    } else if (t.toStatusReference) {
      for (const from of froms) addEdge(from, t.toStatusReference);
    }
  }

  // Una transicion GLOBAL conecta cualquier estado conocido hacia su destino (sin origen puntual).
  for (const ref of allRefs) {
    for (const target of globalTargets) addEdge(ref, target);
  }

  const terminalRefs = new Set([...allRefs].filter((ref) => statusCategoryByRef[ref] === DONE_CATEGORY));

  function canReachTerminal(start) {
    if (terminalRefs.has(start)) return true;
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const current = stack.pop();
      for (const next of adjacency.get(current) || []) {
        if (terminalRefs.has(next)) return true;
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return false;
  }

  const gaps = [];
  for (const ref of allRefs) {
    const isTerminal = terminalRefs.has(ref);
    const noIncoming = !hasIncoming.has(ref);
    const noOutgoing = !hasOutgoing.has(ref) && !hasGlobalExit && !isTerminal;
    // Si ya es un callejon sin salida (grado 0), no hace falta el chequeo de alcanzabilidad -- seria
    // redundante. Si el workflow no declara NINGUN estado "done", no hay nada que alcanzar: se omite
    // el chequeo en vez de marcar todo como atrapado (evita ruido en un workflow atipico).
    const trapped = !isTerminal && !noOutgoing && terminalRefs.size > 0 && !canReachTerminal(ref);
    if (noIncoming || noOutgoing || trapped) {
      gaps.push({ statusReference: ref, noIncoming, noOutgoing, trapped });
    }
  }
  return gaps;
}

export { findGaps, GLOBAL, DONE_CATEGORY };
