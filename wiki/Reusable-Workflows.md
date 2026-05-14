# Reusable Workflows

The [`workflows/`](https://github.com/foundation50/classroom50/tree/main/workflows) directory holds reusable GitHub Actions workflows that other repos (student copies, the template, or any classroom-adjacent project) can consume via `uses:`.

## Consuming a workflow

```yaml
jobs:
  example:
    uses: foundation50/classroom50/.github/workflows/<workflow>.yaml@main
```

See GitHub's [Reusing workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows) docs for the full mechanics: how `inputs:` and `secrets:` map across boundaries, how versions are pinned, and what reusable vs. composite workflows can and can't do.

## What lives here

This area is still being filled in. As new reusable workflows land (autograding harness, submission-tagging job, release-on-submit, etc.), they'll be documented inline in their YAML files and surface here.
