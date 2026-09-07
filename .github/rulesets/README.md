# Repository rulesets

[`main-branch-protection.json`](main-branch-protection.json) protects the
default branch for community contributions. It enforces:

- **Pull requests only** — no direct pushes to `main`.
- **1 approving review**, stale reviews dismissed on new commits, and all review
  threads resolved before merge.
- **Required status check: `build`** (typecheck + build, from
  [`../workflows/ci.yml`](../workflows/ci.yml)), and branches must be up to date.
- **Linear history** — merges are squash or rebase (no merge commits).
- **No force pushes** and **no branch deletion**.
- **Repository admins can bypass** so a solo maintainer isn't locked out. Tighten
  this in the UI (or remove `bypass_actors`) once there are multiple maintainers.

## Applying it

> Do this **after** the code is pushed to `main` the first time — the "pull
> requests only" rule would otherwise block the initial import.

**Option A — GitHub CLI**

```bash
gh api --method POST \
  -H "Accept: application/vnd.github+json" \
  repos/OWNER/REPO/rulesets \
  --input .github/rulesets/main-branch-protection.json
```

**Option B — Web UI**

Settings → Rules → Rulesets → New ruleset → **Import a ruleset**, then select
this JSON file.

## Notes

- The `build` status check only appears after the CI workflow has run at least
  once, so open a throwaway PR (or push a commit) before relying on the gate.
- To also require lint, first resolve the existing `react-hooks/set-state-in-effect`
  lint errors, then add `{ "context": "lint" }` to `required_status_checks` and
  promote lint to its own required job in `ci.yml`.
- `bypass_actors` uses repository role id `5` (Admin). If the API rejects it,
  set the bypass in the UI instead.
