// Prueba real de findGaps(), sin depender del runtime de Forge (nada de @forge/* en este archivo ni
// en findGaps.js). Corre con: node src/resolvers/findGaps.test.mjs
//
// Pedido del usuario (2026-11-17): confirmar que el algoritmo SI detecta un callejon real cuando
// existe, no solo que no marca falsos positivos (eso ya se probo en vivo contra el sitio demo).
//
// El workflow sintetico de abajo calca el patron exacto de JRACLOUD-71188 y del post de ServiceRocket
// ("JIRA and the Locked Room Mystery"): un estado intermedio, no terminal, al que se entra pero del
// que ninguna transicion sale.

import assert from 'node:assert/strict';
import { findGaps, GLOBAL, DONE_CATEGORY } from './findGaps.js';

function run(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
  } catch (err) {
    console.log(`FALLA ${name}`);
    console.log(err.message);
    process.exitCode = 1;
  }
}

// Workflow sintetico: Created -[DIRECTED]-> In Review -[DIRECTED]-> Blocked (sin salida, NO terminal)
//                                      \-[DIRECTED]-> Done (terminal, sin salida: no es un bug)
const workflowConCallejon = {
  statuses: [
    { statusReference: 'created' },
    { statusReference: 'in-review' },
    { statusReference: 'blocked' }, // callejon real: no-terminal, sin salida
    { statusReference: 'done' }, // terminal: sin salida, pero NO es un bug
  ],
  transitions: [
    { type: 'INITIAL', toStatusReference: 'created', links: [] },
    {
      type: 'DIRECTED',
      toStatusReference: 'in-review',
      links: [{ fromStatusReference: 'created' }],
    },
    {
      // "Blocked" tiene entrada (esta transicion) pero NINGUNA transicion sale de "blocked" despues.
      type: 'DIRECTED',
      toStatusReference: 'blocked',
      links: [{ fromStatusReference: 'in-review' }],
    },
    {
      type: 'DIRECTED',
      toStatusReference: 'done',
      links: [{ fromStatusReference: 'in-review' }],
    },
  ],
};

const statusCategoryByRef = {
  created: 'new',
  'in-review': 'indeterminate',
  blocked: 'indeterminate', // NO es "done" -- por eso debe marcarse
  done: 'done',
};

run('detecta el callejon real (Blocked, no-terminal, sin salida)', () => {
  const gaps = findGaps(workflowConCallejon, statusCategoryByRef);
  const blocked = gaps.find((g) => g.statusReference === 'blocked');
  assert.ok(blocked, 'Blocked deberia aparecer en los gaps');
  assert.equal(blocked.noOutgoing, true, 'Blocked deberia marcarse SIN SALIDA');
  assert.equal(blocked.noIncoming, false, 'Blocked SI tiene entrada, no deberia marcarse SIN ENTRADA');
});

run('NO marca el estado terminal (Done) aunque tampoco tenga salida', () => {
  const gaps = findGaps(workflowConCallejon, statusCategoryByRef);
  const done = gaps.find((g) => g.statusReference === 'done');
  assert.equal(done, undefined, 'Done es terminal: no debe aparecer en los gaps');
});

run('NO marca Created ni In Review (tienen entrada y salida reales)', () => {
  const gaps = findGaps(workflowConCallejon, statusCategoryByRef);
  assert.equal(gaps.find((g) => g.statusReference === 'created'), undefined);
  assert.equal(gaps.find((g) => g.statusReference === 'in-review'), undefined);
});

run('detecta un estado sin entrada (unreachable)', () => {
  const workflowConHuerfano = {
    statuses: [{ statusReference: 'created' }, { statusReference: 'orphan' }],
    transitions: [
      { type: 'INITIAL', toStatusReference: 'created', links: [] },
      // "orphan" nunca aparece como toStatusReference de ninguna transicion -> sin entrada.
      { type: 'DIRECTED', toStatusReference: 'created', links: [{ fromStatusReference: 'orphan' }] },
    ],
  };
  const gaps = findGaps(workflowConHuerfano, { created: 'new', orphan: 'new' });
  const orphan = gaps.find((g) => g.statusReference === 'orphan');
  assert.ok(orphan, 'orphan deberia aparecer en los gaps');
  assert.equal(orphan.noIncoming, true);
});

run('una transicion GLOBAL cubre la salida de todo el workflow (sin falso positivo)', () => {
  const workflowConGlobal = {
    statuses: [{ statusReference: 'created' }, { statusReference: 'weird' }],
    transitions: [
      { type: 'INITIAL', toStatusReference: 'created', links: [] },
      { type: 'DIRECTED', toStatusReference: 'weird', links: [{ fromStatusReference: 'created' }] },
      // GLOBAL: disponible desde cualquier estado, incluido "weird" -- no deberia marcarse SIN SALIDA.
      { type: 'GLOBAL', toStatusReference: 'created', links: [] },
    ],
  };
  const gaps = findGaps(workflowConGlobal, { created: 'new', weird: 'new' });
  assert.equal(gaps.find((g) => g.statusReference === 'weird'), undefined);
});

run('un estado alcanzable SOLO por una transicion GLOBAL no se marca sin entrada', () => {
  const workflowGlobalComoUnicaEntrada = {
    statuses: [{ statusReference: 'created' }, { statusReference: 'weird' }],
    transitions: [
      { type: 'INITIAL', toStatusReference: 'created', links: [] },
      // nada transiciona DIRECTO hacia "weird" -- solo la GLOBAL de abajo.
      { type: 'GLOBAL', toStatusReference: 'weird', links: [] },
    ],
  };
  const gaps = findGaps(workflowGlobalComoUnicaEntrada, { created: 'new', weird: 'done' });
  assert.equal(gaps.find((g) => g.statusReference === 'weird'), undefined, 'weird SI tiene entrada (via GLOBAL)');
});

run('detecta un ciclo cerrado que nunca llega a un estado terminal (atrapa el issue para siempre)', () => {
  // Created -> Blocked <-> Waiting for customer (ciclo, ninguno es terminal, ninguno sale del ciclo)
  const workflowConCiclo = {
    statuses: [
      { statusReference: 'created' },
      { statusReference: 'blocked' },
      { statusReference: 'waiting-customer' },
      { statusReference: 'done' },
    ],
    transitions: [
      { type: 'INITIAL', toStatusReference: 'created', links: [] },
      { type: 'DIRECTED', toStatusReference: 'blocked', links: [{ fromStatusReference: 'created' }] },
      { type: 'DIRECTED', toStatusReference: 'waiting-customer', links: [{ fromStatusReference: 'blocked' }] },
      { type: 'DIRECTED', toStatusReference: 'blocked', links: [{ fromStatusReference: 'waiting-customer' }] },
      // "done" existe en el workflow pero nada en el ciclo lleva hasta el -- issue atrapado.
    ],
  };
  const categorias = { created: 'new', blocked: 'indeterminate', 'waiting-customer': 'indeterminate', done: 'done' };
  const gaps = findGaps(workflowConCiclo, categorias);
  const blocked = gaps.find((g) => g.statusReference === 'blocked');
  const waiting = gaps.find((g) => g.statusReference === 'waiting-customer');
  assert.ok(blocked, 'Blocked deberia marcarse atrapado (tiene entrada y salida, pero nunca llega a Done)');
  assert.equal(blocked.trapped, true);
  assert.equal(blocked.noIncoming, false);
  assert.equal(blocked.noOutgoing, false);
  assert.ok(waiting, 'Waiting for customer deberia marcarse atrapado por el mismo motivo');
  assert.equal(waiting.trapped, true);
});

run('un workflow SIN ningun estado terminal no marca nada como atrapado (nada que alcanzar)', () => {
  const workflowSinDone = {
    statuses: [{ statusReference: 'a' }, { statusReference: 'b' }],
    transitions: [
      { type: 'INITIAL', toStatusReference: 'a', links: [] },
      { type: 'DIRECTED', toStatusReference: 'b', links: [{ fromStatusReference: 'a' }] },
      { type: 'DIRECTED', toStatusReference: 'a', links: [{ fromStatusReference: 'b' }] },
    ],
  };
  const gaps = findGaps(workflowSinDone, { a: 'new', b: 'indeterminate' });
  assert.equal(gaps.length, 0, 'sin ningun estado done declarado, no hay base para marcar "atrapado"');
});

run('[mutacion] sin el chequeo de alcanzabilidad, el ciclo cerrado NO se detectaria (confirma que el fix hace algo)', () => {
  // Misma logica vieja: solo grado de entrada/salida, sin DFS hacia un terminal.
  function findGapsSoloGrado(workflow, statusCategoryByRef) {
    const transitions = workflow.transitions || [];
    const hasGlobalExit = transitions.some((t) => t.type === GLOBAL);
    const allRefs = new Set((workflow.statuses || []).map((s) => s.statusReference).filter(Boolean));
    const hasIncoming = new Set();
    const hasOutgoing = new Set();
    for (const t of transitions) {
      if (t.toStatusReference) { allRefs.add(t.toStatusReference); hasIncoming.add(t.toStatusReference); }
      for (const link of t.links || []) {
        if (link.fromStatusReference) { allRefs.add(link.fromStatusReference); hasOutgoing.add(link.fromStatusReference); }
      }
    }
    const gaps = [];
    for (const ref of allRefs) {
      const isTerminal = statusCategoryByRef[ref] === DONE_CATEGORY;
      const noIncoming = !hasIncoming.has(ref);
      const noOutgoing = !hasOutgoing.has(ref) && !hasGlobalExit && !isTerminal;
      if (noIncoming || noOutgoing) gaps.push({ statusReference: ref });
    }
    return gaps;
  }
  const workflowConCiclo = {
    statuses: [{ statusReference: 'created' }, { statusReference: 'blocked' }, { statusReference: 'waiting-customer' }, { statusReference: 'done' }],
    transitions: [
      { type: 'INITIAL', toStatusReference: 'created', links: [] },
      { type: 'DIRECTED', toStatusReference: 'blocked', links: [{ fromStatusReference: 'created' }] },
      { type: 'DIRECTED', toStatusReference: 'waiting-customer', links: [{ fromStatusReference: 'blocked' }] },
      { type: 'DIRECTED', toStatusReference: 'blocked', links: [{ fromStatusReference: 'waiting-customer' }] },
    ],
  };
  const categorias = { created: 'new', blocked: 'indeterminate', 'waiting-customer': 'indeterminate', done: 'done' };
  const gapsViejo = findGapsSoloGrado(workflowConCiclo, categorias);
  // "done" sale marcado igual (nada transiciona hacia el en este workflow sintetico) -- eso es un
  // hallazgo real y distinto (terminal inalcanzable), no lo que esta mutacion prueba. Lo que importa
  // aca es que "blocked"/"waiting-customer" (los nodos DEL CICLO) NO aparecen con la logica vieja.
  assert.equal(gapsViejo.find((g) => g.statusReference === 'blocked'), undefined, 'la logica vieja NO detecta Blocked en el ciclo');
  assert.equal(gapsViejo.find((g) => g.statusReference === 'waiting-customer'), undefined, 'la logica vieja NO detecta Waiting for customer en el ciclo');
});

run('una transicion con varios origenes (links) cuenta salida para CADA uno, no solo el primero', () => {
  const workflow = {
    statuses: [{ statusReference: 'a' }, { statusReference: 'b' }, { statusReference: 'merged' }],
    transitions: [
      { type: 'INITIAL', toStatusReference: 'a', links: [] },
      { type: 'INITIAL', toStatusReference: 'b', links: [] },
      // una sola transicion "merge" con dos origenes distintos (a y b), ambos hacia "merged".
      {
        type: 'DIRECTED',
        toStatusReference: 'merged',
        links: [{ fromStatusReference: 'a' }, { fromStatusReference: 'b' }],
      },
    ],
  };
  const gaps = findGaps(workflow, { a: 'new', b: 'new', merged: 'done' });
  assert.equal(gaps.find((g) => g.statusReference === 'a'), undefined, 'a tiene salida (via la transicion con 2 origenes)');
  assert.equal(gaps.find((g) => g.statusReference === 'b'), undefined, 'b tambien tiene salida, no solo el primer origen de la lista');
});

run('un workflow sano no marca nada', () => {
  const gaps = findGaps(workflowConCallejon, { created: 'new', 'in-review': 'indeterminate', blocked: 'done', done: 'done' });
  // con "blocked" reclasificado como terminal (done), ya no deberia marcarse nada en todo el workflow
  assert.equal(gaps.length, 0);
});

console.log('\nPrueba de mutacion: sacar el fix de categoria done y confirmar que SI vuelve a fallar algo.');
run('[mutacion] sin el filtro de categoria done, Done saldria marcado (confirma que el test de arriba SI prueba el fix)', () => {
  const sinFiltro = {
    ...workflowConCallejon,
  };
  const categoriasVacias = {}; // nada es "done" -> el fix queda sin efecto
  const gaps = findGaps(sinFiltro, categoriasVacias);
  const done = gaps.find((g) => g.statusReference === 'done');
  assert.ok(done, 'sin el fix, Done SI deberia marcarse (esto confirma que el fix real hace algo)');
});
