// Funciones puras del frontend, sin dependencias de @forge/* a proposito (igual que
// src/resolvers/findGaps.js): se pueden probar con node plano, sin simular el runtime de Forge
// ni el DOM. Ver helpers.test.mjs.

/**
 * Confirmado navegando el sitio real (2026-11-17): la URL clasica EditWorkflowDispatcher.jspa falla
 * con "XSRF Security Token Missing" al enlazarla desde afuera de Jira. La pantalla moderna
 * (jira/settings/issues/workflows/<entityId>) no pide token y es la que usa Jira hoy por defecto.
 */
function editWorkflowUrl(siteUrl, entityId) {
  if (!siteUrl || !entityId) return null;
  return `${siteUrl}/jira/settings/issues/workflows/${entityId}`;
}

/**
 * "2 min ago" / "hace 2 min" a partir de un ISO timestamp -- sin libreria externa, UI Kit no trae una.
 * `t` es la funcion de traduccion de @forge/react (useTranslation) con la firma (key, default) => string;
 * el orden de palabras cambia entre idiomas ("2 min ago" vs "hace 2 min"), por eso cada idioma tiene su
 * frase completa con un placeholder {n}, en vez de concatenar fragmentos en un orden fijo.
 */
function timeAgo(isoString, now = Date.now(), t = (key, def) => def) {
  const diffMs = now - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('time.justNow', 'just now');
  if (minutes < 60) return t('time.minutesAgo', '{n} min ago').replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  return t('time.hoursAgo', '{n}h ago').replace('{n}', String(hours));
}

/**
 * Arma el titulo del resumen con pluralizacion correcta ("1 orphan state found in 1 workflow" vs
 * "3 orphan states found in 2 workflows"). Claves tecnicas en ambos idiomas, mismo orden gramatical
 * (sustantivo + cantidad) porque ingles y espanol comparten esa estructura para esta frase en particular.
 */
function buildSummaryTitle(t, totalGaps, totalWorkflows) {
  const stateWord = t(totalGaps === 1 ? 'summary.orphanState' : 'summary.orphanStates', totalGaps === 1 ? 'orphan state' : 'orphan states');
  const workflowWord = t(totalWorkflows === 1 ? 'summary.workflow' : 'summary.workflows', totalWorkflows === 1 ? 'workflow' : 'workflows');
  // "found" no cambia con el numero en ingles, pero "encontrado/encontrados" si en espanol -- clave
  // separada para el plural, no un fragmento fijo (si no, el espanol queda mal concordado).
  const found = t(totalGaps === 1 ? 'summary.found' : 'summary.foundPlural', totalGaps === 1 ? 'found' : 'found');
  const inWord = t('summary.in', 'in');
  return `${totalGaps} ${stateWord} ${found} ${inWord} ${totalWorkflows} ${workflowWord}`;
}

// Claves de exportacion FIJAS en ingles, independientes del idioma de la UI -- es un formato de datos
// (JSON/CSV para importar en otra herramienta), no texto de interfaz; localizar nombres de columna
// complicaria la interoperabilidad sin ningun beneficio real.
function buildExportRows(result) {
  const rows = [];
  for (const wf of result.workflows) {
    for (const gap of wf.gaps) {
      rows.push({
        workflow: wf.name,
        status: gap.name,
        noIncoming: gap.noIncoming,
        noOutgoing: gap.noOutgoing,
        trapped: gap.trapped,
      });
    }
  }
  return rows;
}

function toCsv(rows) {
  const header = 'workflow,status,no_incoming,no_outgoing,trapped';
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.workflow, r.status, r.noIncoming, r.noOutgoing, r.trapped].map(escape).join(','));
  return [header, ...lines].join('\n');
}

export { editWorkflowUrl, timeAgo, buildSummaryTitle, buildExportRows, toCsv };
