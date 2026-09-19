# Not yet workflows

These two belong in `.github/workflows/`. They are here because the token
that pushed them had no `workflow` scope, and GitHub refuses a push that
writes that directory without it.

To land them:

    git mv .github/workflows-pending .github/workflows
    git rm .github/workflows/README.md
    git commit -m "ci: the two tests, and publish on a tag"
    git push

from a checkout whose credentials have the scope -- a personal access
token with `workflow`, or `gh auth refresh -h github.com -s workflow`.
