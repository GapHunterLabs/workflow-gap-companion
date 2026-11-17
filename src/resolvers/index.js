import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { findGaps } from './findGaps';
import { nextStartAt } from './pagination';

const resolver = new Resolver();

// Forge no publica un numero exacto y estable para el timeout de una funcion sync invocada por la UI
// (rondaba los 25s en lo que se pudo encontrar, pero no esta confirmado contra la cuenta real) -- en
// vez de asumir un numero, se corta por presupuesto de tiempo propio, mas conservador, y se avisa en
// la respuesta si quedo trabajo sin terminar. Pendiente: medir el timeout real contra un sitio grande.
const TIME_BUDGET_MS = 18000;
const PAGE_SIZE = 100;
const MAX_RETRIES_429 = 3;

/** GET con reintento ante 429 (rate limit) -- respeta Retry-After si Jira lo manda, si no usa backoff. */
async function fetchJiraWithRetry(routeValue) {
  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt += 1) {
    const res = await api.asApp().requestJira(routeValue);
    if (res.status !== 429) return res;
    if (attempt === MAX_RETRIES_429) return res;
    const retryAfterHeader = res.headers.get('Retry-After');
    const waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 500 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  // Inalcanzable (el loop siempre retorna), pero evita que el linter se queje de falta de retorno.
  return api.asApp().requestJira(routeValue);
}

/**
 * Pagina GET /rest/api/3/workflows/search completo (confirmado: cursor "isLast"/"startAt"/"maxResults",
 * no un cursor opaco -- la paginacion de esta familia de endpoints es por offset). isActive=true para
 * no meter ruido de workflows en desuso/borradores en el reporte (pedido explicito, 2026-11-17).
 * Corta por presupuesto de tiempo, no por cantidad de paginas: un sitio con 500 workflows reales puede
 * necesitar mas de una pagina de 100, y no hay forma de saber de antemano cuantas sin probarlo.
 */
async function fetchAllWorkflows(startTime) {
  const values = [];
  let startAt = 0;
  let isLast = false;
  let truncated = false;

  while (!isLast) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      truncated = true;
      break;
    }
    const res = await fetchJiraWithRetry(
      route`/rest/api/3/workflows/search?expand=values.transitions&isActive=true&startAt=${startAt}&maxResults=${PAGE_SIZE}`
    );
    if (!res.ok) return { error: res, values, truncated };
    const page = await res.json();
    const pageValues = page.values || [];
    values.push(...pageValues);
    isLast = Boolean(page.isLast);
    startAt = nextStartAt(startAt, pageValues.length, PAGE_SIZE);
  }

  return { error: null, values, truncated };
}

// Codigo de razon, no el texto final -- el frontend lo traduce con useTranslation() segun el locale
// real del usuario (ver src/frontend/index.jsx). El resolver no conoce el idioma del usuario que lo
// invoca, asi que nunca arma el mensaje final.
function errorCodeFor(status) {
  if (status === 403 || status === 401) return 'forbidden';
  if (status === 429) return 'rateLimited';
  return 'other';
}

resolver.define('getWorkflowGaps', async () => {
  const startTime = Date.now();
  const { error, values, truncated } = await fetchAllWorkflows(startTime);

  if (error) {
    const body = await error.text();
    return {
      ok: false,
      status: error.status,
      errorCode: errorCodeFor(error.status),
      rawBodySnippet: body.slice(0, 500),
    };
  }

  // Catalogo de nombres y categoria de estado (familia clasica, scope read:jira-work, confirmado que
  // funciona). statusReference coincide con el id clasico -- confirmado en vivo (los nombres
  // resolvieron bien contra un sitio real); si no hay match, se muestra la referencia cruda.
  let statusNames = {};
  let statusCategoryByRef = {};
  const statusRes = await fetchJiraWithRetry(route`/rest/api/3/status`);
  if (statusRes.ok) {
    const statuses = await statusRes.json();
    statusNames = Object.fromEntries(statuses.map((s) => [s.id, s.name]));
    statusCategoryByRef = Object.fromEntries(statuses.map((s) => [s.id, s.statusCategory && s.statusCategory.key]));
  }

  const workflows = values.map((wf) => {
    // name queda null cuando no se pudo resolver el nombre del estado -- el frontend arma el texto
    // de respaldo ("(reference {ref})"/"(referencia {ref})") con statusReference, traducido segun
    // el locale real del usuario.
    const gaps = findGaps(wf, statusCategoryByRef).map((g) => ({
      ...g,
      name: statusNames[g.statusReference] || null,
    }));
    return {
      // null en vez de un texto de respaldo en espanol -- mismo motivo, el frontend lo traduce.
      name: wf.name || null,
      // wf.id es directamente el UUID como string (no un objeto {name, entityId} -- eso era un
      // ejemplo de OTRO endpoint en el spec, confirmado distinto contra la respuesta real,
      // 2026-11-17). Es el mismo UUID que usa la pantalla moderna de edicion de workflows de Jira
      // (jira/settings/issues/workflows/<id>) -- confirmado navegando el sitio real: la URL clasica
      // EditWorkflowDispatcher.jspa da "XSRF Security Token Missing" al enlazarla desde afuera, la
      // nueva no pide token.
      entityId: typeof wf.id === 'string' ? wf.id : undefined,
      totalStatuses: (wf.statuses || []).length,
      totalTransitions: (wf.transitions || []).length,
      gaps,
    };
  });

  return {
    ok: true,
    truncated,
    scannedAt: new Date().toISOString(),
    totalWorkflows: workflows.length,
    totalGaps: workflows.reduce((sum, w) => sum + w.gaps.length, 0),
    workflows,
  };
});

export const handler = resolver.getDefinitions();
