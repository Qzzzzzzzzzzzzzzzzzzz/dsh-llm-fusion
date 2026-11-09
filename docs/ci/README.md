# CI

`verify.yml` in this directory is the GitHub Actions workflow for this
repository.

It is not installed at `.github/workflows/verify.yml` because the token used to
publish this repository carries only the `repo` scope, and GitHub refuses any
commit that touches a workflow file without the `workflow` scope.

To enable CI, copy it into place and push with an account that may modify
workflows:

```bash
mkdir -p .github/workflows
cp docs/ci/verify.yml .github/workflows/verify.yml
git add .github/workflows/verify.yml
git commit -m "ci: enable the verify workflow"
git push
```

The workflow runs on Node 24: `npm install --no-audit --no-fund`, `npm run
build`, `npm test` (both engine suites plus the cross-engine load check).