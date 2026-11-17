# Privacy Policy: Workflow Gap Companion

**Effective date:** 2026-11-17

Workflow Gap Companion is a Gap Hunter Labs app for Jira Cloud (built
on the Atlassian Forge platform). This policy is short because the
app's design makes it short: there is nothing to disclose beyond what
is below.

## What this app collects

**Nothing beyond what it needs to show you a scan result, and nothing
is retained.** Workflow Gap Companion does not collect, transmit, or
sell any data about you or your organization. It never touches issue
data, comments, attachments, or any personally identifiable
information about Jira users.

## What it reads, and why

Each time you open the app or press Refresh, it reads, directly from
your own Atlassian site, through two read-only API scopes:

- **Workflow structure** (`read:workflow:jira`): the statuses and
  transitions declared in your site's active workflows.
- **Status names and categories** (`read:jira-work`): the labels
  already configured in your site (for example "In Review", "Done"),
  so the report can show real names instead of internal IDs.

Neither scope grants write access. The app never changes a workflow,
a status, or anything else in your site.

## What it stores

**Nothing.** Workflow Gap Companion has no database and uses no
persistent storage (no Forge Storage, no key-value store, no browser
`localStorage`). Every scan runs fresh: close the app or press
Refresh, and the next scan reads your site again from scratch. Nothing
survives between scans, and nothing survives after you uninstall the
app.

## Network access

The app's backend (a Forge function) only calls your own Atlassian
site's own REST API, inside Atlassian's Forge runtime. It makes no
calls to Gap Hunter Labs or to any third-party service. No data ever
leaves the Atlassian platform.

## Third parties

None. Workflow Gap Companion has no third-party SDKs, no analytics
libraries, no ad networks, and no external dependencies that phone
home.

## Changes to this policy

If this ever changes, this file will be updated and the change will
be noted in the app's changelog.

## Contact

Questions about this policy: **contact@gaphunterlabs.com**
