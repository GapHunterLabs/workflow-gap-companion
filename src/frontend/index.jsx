import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  CodeBlock,
  DynamicTable,
  EmptyState,
  Heading,
  I18nProvider,
  Inline,
  LinkButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Tooltip,
  useProductContext,
  useTranslation,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { editWorkflowUrl, timeAgo, buildSummaryTitle, buildExportRows, toCsv } from './helpers';

const GapBadge = ({ gap, t }) => (
  <Inline space="space.050">
    {gap.noIncoming && <Lozenge appearance="removed">{t('badge.noIncoming', 'NO INCOMING')}</Lozenge>}
    {gap.noOutgoing && <Lozenge appearance="removed">{t('badge.noOutgoing', 'DEAD END')}</Lozenge>}
    {gap.trapped && <Lozenge appearance="removed">{t('badge.trapped', 'CLOSED CYCLE')}</Lozenge>}
  </Inline>
);

const WorkflowSection = ({ workflow, siteUrl, t }) => {
  const head = {
    cells: [
      { key: 'status', content: t('table.status', 'Status') },
      { key: 'gap', content: t('table.problem', 'Problem') },
    ],
  };
  const unresolvedRef = (ref) => t('status.unresolvedRef', '(reference {ref})').replace('{ref}', ref);
  const rows = workflow.gaps.map((gap, i) => ({
    key: `${workflow.name}-${i}`,
    cells: [
      { key: 'status', content: <Text>{gap.name || unresolvedRef(gap.statusReference)}</Text> },
      { key: 'gap', content: <GapBadge gap={gap} t={t} /> },
    ],
  }));
  const editUrl = editWorkflowUrl(siteUrl, workflow.entityId);
  const displayName = workflow.name || t('workflow.unnamed', '(unnamed)');

  return (
    <Box padding="space.200">
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Inline space="space.100" alignBlock="center">
            {/* Tooltip con el nombre completo -- nombres de workflow corporativos pueden ser largos;
                el texto igual envuelve en vez de desbordar, asi que nunca rompe la tarjeta. */}
            <Tooltip content={displayName}>
              <Heading as="h3">{displayName}</Heading>
            </Tooltip>
            <Text size="small">
              {t('workflow.statusesAndTransitions', '{n} statuses, {m} transitions')
                .replace('{n}', workflow.totalStatuses)
                .replace('{m}', workflow.totalTransitions)}
            </Text>
          </Inline>
          {editUrl && (
            <LinkButton href={editUrl} target="_blank" appearance="primary">
              {t('workflow.editLink', 'Edit this workflow')}
            </LinkButton>
          )}
        </Inline>
        {workflow.gaps.length === 0 ? (
          <Lozenge appearance="success">{t('workflow.noGapsFound', 'No dead ends found')}</Lozenge>
        ) : (
          <DynamicTable head={head} rows={rows} />
        )}
      </Stack>
    </Box>
  );
};

const ExportPanel = ({ result, t }) => {
  const [format, setFormat] = useState('json');
  const [copyState, setCopyState] = useState('idle'); // idle | copied | blocked
  const rows = buildExportRows(result);
  const text = format === 'json' ? JSON.stringify(rows, null, 2) : toCsv(rows);

  // CodeBlock (UI Kit) no trae un boton de copiar propio -- confirmado revisando sus props.
  // navigator.clipboard.writeText() esta bloqueado por la politica de permisos del iframe de Forge
  // (confirmado: es un limite de plataforma documentado en la comunidad de desarrolladores de
  // Atlassian, con un pedido de feature abierto para arreglarlo -- no es un bug de esta app).
  // Fallback probado: document.execCommand('copy') sobre un textarea oculto, que a veces evade esa
  // politica porque no pasa por el Clipboard API moderno.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
      return;
    } catch {
      // sigue al fallback de abajo
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopyState(ok ? 'copied' : 'blocked');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('blocked');
    }
  };
  const copyLabel = {
    idle: t('export.copy', 'Copy'),
    copied: t('export.copied', 'Copied to clipboard!'),
    blocked: t('export.blocked', 'Copy blocked -- select the text manually'),
  }[copyState];

  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Inline space="space.100">
          <Button appearance={format === 'json' ? 'primary' : 'default'} onClick={() => setFormat('json')}>
            JSON
          </Button>
          <Button appearance={format === 'csv' ? 'primary' : 'default'} onClick={() => setFormat('csv')}>
            CSV
          </Button>
        </Inline>
        <Button appearance={copyState === 'copied' ? 'primary' : copyState === 'blocked' ? 'warning' : 'default'} onClick={copy}>
          {copyLabel}
        </Button>
      </Inline>
      <CodeBlock text={text} language={format === 'json' ? 'json' : 'text'} shouldWrapLongLines />
    </Stack>
  );
};

const errorMessageFor = (result, t) => {
  if (result.errorCode === 'forbidden') return t('error.forbidden', 'Insufficient permissions.');
  if (result.errorCode === 'rateLimited') return t('error.rateLimited', 'Rate limited, try again later.');
  return `${t('error.genericPrefix', 'Jira responded {status}:').replace('{status}', result.status)} ${result.rawBodySnippet}`;
};

const App = () => {
  const [result, setResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const context = useProductContext();
  const siteUrl = context && context.siteUrl;
  const { t, ready } = useTranslation();

  const load = useCallback(() => {
    setRefreshing(true);
    invoke('getWorkflowGaps').then((r) => {
      setResult(r);
      setRefreshing(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!ready || !result) {
    return (
      <Box padding="space.200">
        <Stack space="space.100">
          <Spinner size="medium" label={t('app.loading', 'Analyzing workflows...')} />
          <Text size="small">{t('app.loadingHint', 'This can take a few seconds on sites with many workflows.')}</Text>
        </Stack>
      </Box>
    );
  }

  if (!result.ok) {
    // 403/401: reintentar no va a cambiar nada (es un permiso, no algo transitorio) -- EmptyState
    // da una tarjeta limpia y centrada en vez del mismo banner de error que un 429/fallo de red.
    if (result.status === 403 || result.status === 401) {
      return (
        <Box padding="space.400">
          <EmptyState
            header={t('app.insufficientPermissions.header', 'Insufficient permissions')}
            description={errorMessageFor(result, t)}
          />
        </Box>
      );
    }
    return (
      <Box padding="space.200">
        <Stack space="space.200">
          <SectionMessage appearance="error" title={t('app.error.title', 'Could not complete the analysis')}>
            <Text>{errorMessageFor(result, t)}</Text>
          </SectionMessage>
          <Button onClick={load} isDisabled={refreshing}>
            {refreshing ? t('app.retrying', 'Retrying...') : t('app.retry', 'Retry')}
          </Button>
        </Stack>
      </Box>
    );
  }

  const workflowsWithGaps = result.workflows.filter((w) => w.gaps.length > 0);
  const workflowsClean = result.workflows.filter((w) => w.gaps.length === 0);
  const displayName = (w) => w.name || t('workflow.unnamed', '(unnamed)');

  return (
    <Box padding="space.200">
      <Stack space="space.200">
        <Inline space="space.200" alignBlock="center" spread="space-between">
          <Heading as="h2">Workflow Gap Companion</Heading>
          <Inline space="space.100" alignBlock="center">
            <Text size="small">
              {t('app.analyzed', 'Analyzed')} {result.totalWorkflows} {t('app.activeWorkflows', 'active workflows')}{' '}
              {timeAgo(result.scannedAt, Date.now(), t)}
            </Text>
            <Button onClick={load} isDisabled={refreshing}>
              {refreshing ? t('app.refreshing', 'Analyzing...') : t('app.refresh', 'Refresh')}
            </Button>
          </Inline>
        </Inline>

        {result.truncated && (
          <SectionMessage appearance="warning" title={t('app.truncated.title', 'Incomplete analysis (time limit)')}>
            <Text>{t('app.truncated.body', 'This site has more workflows than could be checked in a single run.')}</Text>
          </SectionMessage>
        )}

        {result.totalGaps > 0 ? (
          <SectionMessage appearance="warning" title={buildSummaryTitle(t, result.totalGaps, result.totalWorkflows)}>
            <Text>{t('summary.gaps.body', 'A state with no incoming or outgoing transition is a real trap.')}</Text>
          </SectionMessage>
        ) : (
          <SectionMessage appearance="success" title={t('summary.noGaps.title', 'No dead ends found')}>
            <Text>{t('summary.noGaps.body', 'No workflow in this site has a state with no incoming or outgoing transition.')}</Text>
          </SectionMessage>
        )}

        {result.totalGaps > 0 && (
          <Stack space="space.100">
            <Button onClick={() => setShowExport(!showExport)}>
              {showExport ? t('export.hide', 'Hide export') : t('export.show', 'Export report')}
            </Button>
            {showExport && <ExportPanel result={result} t={t} />}
          </Stack>
        )}

        {workflowsWithGaps.length > 0 && (
          <Stack space="space.100">
            <Heading as="h3">{t('workflows.withProblems', 'Workflows with problems')}</Heading>
            {workflowsWithGaps.map((w) => (
              <WorkflowSection key={w.name} workflow={w} siteUrl={siteUrl} t={t} />
            ))}
          </Stack>
        )}

        {workflowsClean.length > 0 && (
          <Stack space="space.100">
            <Heading as="h3">
              {t('workflows.withoutProblems', 'Workflows without problems')} ({workflowsClean.length})
            </Heading>
            <Text size="small">{workflowsClean.map(displayName).join(', ')}</Text>
          </Stack>
        )}

        {result.totalWorkflows === 0 && <EmptyState header={t('workflows.noneFound', 'No workflows found in this site')} />}
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
