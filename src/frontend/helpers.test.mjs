// Prueba real de las funciones puras del frontend (sin @forge/*, sin DOM).
// Corre con: node src/frontend/helpers.test.mjs

import assert from 'node:assert/strict';
import { editWorkflowUrl, timeAgo, buildSummaryTitle, buildExportRows, toCsv } from './helpers.js';

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

// Simula la t() real de @forge/react/useTranslation: (key, default) => texto, con un diccionario chico
// por idioma, igual de forma que los JSON reales en static/locales/.
const en = {
  'time.justNow': 'just now',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n}h ago',
  'summary.orphanState': 'orphan state',
  'summary.orphanStates': 'orphan states',
  'summary.found': 'found',
  'summary.foundPlural': 'found',
  'summary.in': 'in',
  'summary.workflow': 'workflow',
  'summary.workflows': 'workflows',
};
const es = {
  'time.justNow': 'hace instantes',
  'time.minutesAgo': 'hace {n} min',
  'time.hoursAgo': 'hace {n} h',
  'summary.orphanState': 'estado huérfano',
  'summary.orphanStates': 'estados huérfanos',
  'summary.found': 'encontrado',
  'summary.foundPlural': 'encontrados',
  'summary.in': 'en',
  'summary.workflow': 'workflow',
  'summary.workflows': 'workflows',
};
const tFor = (dict) => (key, def) => dict[key] ?? def;

run('editWorkflowUrl arma la URL moderna con el UUID real (confirmado en vivo 2026-11-17)', () => {
  const url = editWorkflowUrl('https://one-atlas-nukl.atlassian.net', '7dfd143e-a5f3-4b25-8a1f-e732f1a3d7aa');
  assert.equal(url, 'https://one-atlas-nukl.atlassian.net/jira/settings/issues/workflows/7dfd143e-a5f3-4b25-8a1f-e732f1a3d7aa');
});

run('editWorkflowUrl devuelve null sin siteUrl (evita un link roto)', () => {
  assert.equal(editWorkflowUrl(undefined, 'abc'), null);
});

run('editWorkflowUrl devuelve null sin entityId (workflows viejos que no lo traen)', () => {
  assert.equal(editWorkflowUrl('https://x.atlassian.net', undefined), null);
});

run('timeAgo sin t: menos de un minuto (fallback en ingles por defecto)', () => {
  const now = Date.parse('2026-11-17T12:00:30Z');
  assert.equal(timeAgo('2026-11-17T12:00:00Z', now), 'just now');
});

run('timeAgo en ingles: minutos', () => {
  const now = Date.parse('2026-11-17T12:05:00Z');
  assert.equal(timeAgo('2026-11-17T12:00:00Z', now, tFor(en)), '5 min ago');
});

run('timeAgo en ingles: horas', () => {
  const now = Date.parse('2026-11-17T15:00:00Z');
  assert.equal(timeAgo('2026-11-17T12:00:00Z', now, tFor(en)), '3h ago');
});

run('timeAgo en espanol: menos de un minuto', () => {
  const now = Date.parse('2026-11-17T12:00:30Z');
  assert.equal(timeAgo('2026-11-17T12:00:00Z', now, tFor(es)), 'hace instantes');
});

run('timeAgo en espanol: minutos (el orden de palabras es distinto al ingles)', () => {
  const now = Date.parse('2026-11-17T12:05:00Z');
  assert.equal(timeAgo('2026-11-17T12:00:00Z', now, tFor(es)), 'hace 5 min');
});

run('timeAgo en espanol: horas', () => {
  const now = Date.parse('2026-11-17T15:00:00Z');
  assert.equal(timeAgo('2026-11-17T12:00:00Z', now, tFor(es)), 'hace 3 h');
});

run('buildSummaryTitle en ingles: singular (1 estado, 1 workflow)', () => {
  assert.equal(buildSummaryTitle(tFor(en), 1, 1), '1 orphan state found in 1 workflow');
});

run('buildSummaryTitle en ingles: plural (3 estados, 2 workflows)', () => {
  assert.equal(buildSummaryTitle(tFor(en), 3, 2), '3 orphan states found in 2 workflows');
});

run('buildSummaryTitle en espanol: singular', () => {
  assert.equal(buildSummaryTitle(tFor(es), 1, 1), '1 estado huérfano encontrado en 1 workflow');
});

run('buildSummaryTitle en espanol: plural (concordancia correcta: "encontrados", no "encontrado")', () => {
  assert.equal(buildSummaryTitle(tFor(es), 3, 2), '3 estados huérfanos encontrados en 2 workflows');
});

run('[mutacion] usar "found" fijo sin pluralizar rompe la concordancia en espanol', () => {
  const buggyBuildSummaryTitle = (tt, totalGaps, totalWorkflows) => {
    const stateWord = tt(totalGaps === 1 ? 'summary.orphanState' : 'summary.orphanStates', '');
    const workflowWord = tt(totalWorkflows === 1 ? 'summary.workflow' : 'summary.workflows', '');
    const found = tt('summary.found', 'found'); // bug: siempre singular
    const inWord = tt('summary.in', 'in');
    return `${totalGaps} ${stateWord} ${found} ${inWord} ${totalWorkflows} ${workflowWord}`;
  };
  assert.notEqual(buggyBuildSummaryTitle(tFor(es), 3, 2), buildSummaryTitle(tFor(es), 3, 2));
});

run('buildSummaryTitle: cero hallazgos no revienta (caso borde, aunque la UI no lo muestra con 0)', () => {
  assert.equal(buildSummaryTitle(tFor(en), 0, 5), '0 orphan states found in 5 workflows');
});

run('buildExportRows aplana workflows+gaps en filas con claves tecnicas en ingles', () => {
  const result = {
    workflows: [
      { name: 'WF A', gaps: [{ name: 'Blocked', noIncoming: false, noOutgoing: true, trapped: false }] },
      { name: 'WF B', gaps: [] },
    ],
  };
  const rows = buildExportRows(result);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { workflow: 'WF A', status: 'Blocked', noIncoming: false, noOutgoing: true, trapped: false });
});

run('toCsv escapa comas y comillas en los nombres', () => {
  const rows = [{ workflow: 'WF, con coma', status: 'Status "raro"', noIncoming: false, noOutgoing: true, trapped: false }];
  const csv = toCsv(rows);
  assert.ok(csv.includes('"WF, con coma"'), 'la coma debe quedar dentro de comillas');
  assert.ok(csv.includes('"Status ""raro"""'), 'las comillas internas se duplican, formato CSV estandar');
});

run('toCsv con cero filas solo tiene el encabezado en ingles', () => {
  const csv = toCsv([]);
  assert.equal(csv, 'workflow,status,no_incoming,no_outgoing,trapped');
});
