import assert from 'node:assert/strict';
import { nextStartAt } from './pagination.js';

function test(name, fn) {
  try {
    fn();
    console.log('OK  ', name);
  } catch (err) {
    console.log('FAIL', name);
    throw err;
  }
}

test('avanza por el tamano REAL de la pagina, no el pedido', () => {
  // Caso real: se pidieron 100, Jira devolvio 50 (confirmado en vivo, 2026-11-17).
  assert.equal(nextStartAt(0, 50, 100), 50);
});

test(
  '[mutacion] avanzar por el tamano PEDIDO en vez del real salta registros ' +
    '(reproduce el bug real: 103 workflows, se perdian los del rango 50-99)',
  () => {
    // Si el codigo volviera a usar requestedPageSize en vez de pageValuesLength, este test fallaria:
    // nextStartAt(0, 50, 100) daria 100 en vez de 50, saltandose el rango 50-99 igual que paso en vivo.
    const buggyNextStartAt = (startAt, _pageValuesLength, requestedPageSize) => startAt + requestedPageSize;
    assert.notEqual(buggyNextStartAt(0, 50, 100), nextStartAt(0, 50, 100));
  }
);

test('una pagina completa (tamano real == pedido) avanza igual que antes', () => {
  assert.equal(nextStartAt(0, 100, 100), 100);
});

test('una pagina vacia con isLast=false (caso raro) avanza por el tamano pedido, no se traba', () => {
  assert.equal(nextStartAt(50, 0, 100), 150);
});

test('startAt distinto de cero se respeta como base', () => {
  assert.equal(nextStartAt(200, 50, 100), 250);
});
