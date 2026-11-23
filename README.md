# Workflow Gap Companion

Atlassian Forge app for Jira Cloud. **Finds workflow states with no way
out**, including closed cycles that never reach a Done-category state,
before they trap a real issue.

## Why it exists

Built after reading Atlassian's own knowledge base article on a real
Jira Cloud bug ([JRACLOUD-71188](https://jira.atlassian.com/browse/JRACLOUD-71188)):
a workflow status that issues could enter but never leave, because
nothing pointed back out. The same kind of structural gap shows up in
code too (a path with no guard, a reference that goes nowhere), and a
Jira workflow has exactly the same shape as a graph.

## What it checks

- **States with no incoming transition**: dead code that no issue can
  ever reach.
- **States with no outgoing transition**, unless they are a
  Done-category state or already covered by a global transition: a
  genuine dead end.
- **Trapped states**: states that have a way out but never reach any
  Done-category state, such as a closed cycle (even a single state that
  only transitions to itself), so an issue can loop forever without a
  way to close.

Every workflow with a problem gets a direct link to its editor. The
full report exports to JSON or CSV.

## What it doesn't check (yet)

Only the declared workflow structure (statuses, transitions, global
transitions), not the runtime behavior of conditions and
post-functions from other apps, which can block a transition for
reasons the declared graph doesn't show. This first version doesn't
write anything back to Jira either: fixing a workflow is still a
manual step for the admin.

## Permissions

Two read-only scopes, nothing else:

- `read:workflow:jira`: reads workflow structure (statuses,
  transitions).
- `read:jira-work`: reads status names and categories.

No write access, no data stored between scans, nothing leaves your
Atlassian site. Details in [PRIVACY.md](PRIVACY.md).

## Development

```
npm install
forge deploy -e development
forge install --environment development
```

Tests (pure logic, no Forge runtime needed):

```
node src/resolvers/findGaps.test.mjs
node src/resolvers/pagination.test.mjs
node src/frontend/helpers.test.mjs
```

## Support this project

If this tool saved you time, a star on GitHub helps other developers find it: https://github.com/GapHunterLabs/workflow-gap-companion

If you want to help keep it free and maintained, you can buy me a coffee:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/gaphunterl1)

## Support

- **Bugs and feature requests:** [GitHub Issues](https://github.com/GapHunterLabs/workflow-gap-companion/issues)
- **Questions:** **contact@gaphunterlabs.com**
- **Security vulnerabilities:** report privately as described in [SECURITY.md](SECURITY.md), not in a public issue.
- **Privacy and network behavior:** [PRIVACY.md](PRIVACY.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
