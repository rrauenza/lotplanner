## Agent skills

### Issue tracker

Issues live in GitHub Issues at `rrauenza/lotplanner`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

**If `gh` refuses every write** with `Resource not accessible by personal access token`, suspect the
environment before the token's permissions: reads still work, so it looks like a scope problem. On
this machine a repo-scoped token lives at `~/.config/gh/lotplanner.token`, and `~/.bashrc` exports it
as `GH_TOKEN` **only in interactive shells inside this repo** — so a script, a hook or an agent's
non-interactive shell gets the read-only token from `~/.config/gh/hosts.yml` instead. Set it for the
command: `GH_TOKEN="$(cat ~/.config/gh/lotplanner.token)" gh issue comment 12 --body ...`. Never
print the value, and never write it into a file or a commit.

### Triage labels

Five canonical triage roles, each label string equal to its role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
