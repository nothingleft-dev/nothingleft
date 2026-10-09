# Application deployment tools

Runner-side tooling for the GitHub Actions API and frontend deployments
(`.github/workflows/deploy-oci.yml`, `.github/workflows/deploy-vercel.yml`,
`.github/workflows/deploy-marketing.yml`). Hosting
requirements and configuration are in [docs/infrastructure.md](../../docs/infrastructure.md).

The destination host must have its deployment controller installed before the
API workflow is activated. This directory contains the application-side contract
and transport; it does not provision infrastructure or configure host monitoring.
GitHub runners build and upload releases, then invoke the installed controller
through a pinned, restricted SSH identity.

| File | Purpose |
|---|---|
| `build-release.py` | Build a Linux ARM64 release from tracked application files |
| `check-deploy-ci.py` | Require passed CI for the current main commit |
| `ci-connection.py` | Temporary runner SSH ingress, pinned upload and restricted commands |
| `render-deploy-env.py` | Select service-prefixed GitHub inputs without printing values |
| `env_contract.py` | Preserve runtime key names and validate environment configuration |
| `release_lib.py` | Validate artifacts and migration/runtime compatibility |
| `vercel-deploy.py` | Synchronize UI production configuration and deploy Next.js |
| `cloudflare-deploy.py` | Build the marketing site, deploy its Worker and synchronize Worker secrets |
| `api.env.example`, `ui.env.example` | Credential-free configuration templates |
| `test_release.py`, `test_deployment_env.py` | Public runner and configuration safety tests |

Credentials belong in GitHub Secrets or ignored local environments. Local
`apps/api/.env` remains in place and must not be included in release artifacts.
Validate the first real GitHub/Vercel deployment before launch. Run local checks:

```sh
python3 -m unittest discover -s infra/oci -p 'test_*.py'
```
