# AutoDeploy presentation guide

## One-sentence introduction

“AutoDeploy is a CI/CD system that turns a source-code push into a tested, versioned, containerized, health-verified deployment, with automatic rollback when a release is unhealthy.”

## The problem

Without automation, a developer must repeatedly:

1. Remember to run the correct tests.
2. Build the application in a consistent environment.
3. Create and tag a Docker image.
4. Sign in to the registry and publish the image.
5. Connect to the server and replace the running application.
6. Verify that the new release works.
7. Restore an older release manually when something fails.

This process is slow and error-prone. Steps can be skipped, local and server environments can differ, image versions can become difficult to trace, and a broken release can remain online until somebody notices it.

## The solution

AutoDeploy stores the delivery process as code in `.github/workflows/ci-cd.yml`:

- Every pull request runs syntax checks, tests, coverage checks, a dependency security audit, a Docker build, and a live container smoke test.
- A successful push to `main` publishes both `latest` and an immutable commit-SHA image to Docker Hub.
- GitHub Actions securely connects to the Linux server over SSH and starts the exact SHA-tagged image.
- Docker health checks confirm that the process is actually responding.
- The deployment script restores the previous image if the candidate release fails.
- GitHub notifications and an optional Slack webhook make failures visible.

Without any secrets, the workflow operates in CI-only mode: syntax checks, tests, coverage enforcement, dependency auditing, image building, and the live container smoke test still run. Publishing and remote deployment are opt-in through the `ENABLE_DEPLOYMENT=true` repository variable.

## Practical use case

Imagine a small team maintaining an Express backend for a college portal, internal inventory system, booking service, or startup API. Developers push changes several times per week. The team does not have a dedicated release engineer, but it still needs consistent releases and fast recovery.

AutoDeploy gives that team a lightweight delivery system:

- Developers receive test feedback before merging.
- Every environment runs the same Docker image.
- A deployed container can be traced back to a Git commit.
- Routine releases require no manual server commands.
- An unhealthy release is automatically rejected and rolled back.

## Recommended 7-minute demonstration

### 1. State the problem — 45 seconds

Say:

> “Manual deployment depends on a person remembering every command. That creates inconsistent builds, missed tests, unclear versions, and slow recovery. This project makes the release process repeatable and verifiable.”

### 2. Show the architecture — 60 seconds

Open the pipeline diagram in `README.md` or the dashboard’s **Delivery workflow** section.

Explain the stages in order:

1. A developer pushes code to GitHub.
2. GitHub Actions installs dependencies and runs tests.
3. It builds and smoke-tests a Docker container.
4. It publishes an immutable image to Docker Hub.
5. It deploys that image to the Linux server over SSH.
6. It waits for the health check and rolls back on failure.

Emphasize that pull requests cannot publish or deploy.

### 3. Start the application — 45 seconds

From PowerShell:

```powershell
cd "C:\Users\Shauryam Bajpai\Desktop\DevOps"
npm.cmd install
npm.cmd start
```

Open <http://localhost:3000> and identify the live values:

- Application health and readiness
- Response latency
- Process uptime
- Memory consumption
- Requests served
- Release version and Node.js runtime

Click **Run system check**. Explain that the browser calls the actual backend endpoints and does not display hard-coded health values.

### 4. Prove the API health checks — 45 seconds

Open <http://localhost:3000/health> in another tab, or run:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/ready
```

Explain the difference:

- Liveness (`/health`) says the process is running.
- Readiness (`/ready`) says the application is prepared to receive traffic.

Docker and the deployment script use the health result to decide whether a release is safe.

### 5. Show automated quality checks — 60 seconds

```powershell
npm.cmd run check
npm.cmd run test:coverage
npm.cmd audit --omit=dev
```

Point out that the pipeline enforces at least 80% line, branch, and function coverage. A failing test, insufficient coverage, syntax error, or high-severity production vulnerability stops later jobs.

### 6. Demonstrate containerization — 60 seconds

Stop the direct Node process with `Ctrl+C`, then run:

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:3000/health
```

Explain that the Dockerfile uses two stages: one installs production dependencies, and the final image contains only what is needed to run. The process runs as the unprivileged `node` user and includes its own health check.

After the demonstration:

```powershell
docker compose down
```

### 7. Show the real pipeline definition — 60 seconds

Open `.github/workflows/ci-cd.yml` and show the four main jobs:

- `test`
- `container`
- `publish`
- `deploy`

Then open `scripts/deploy.sh` and show `PREVIOUS_IMAGE`, `wait_until_healthy`, and the rollback block. Explain that this is the reliability mechanism, not merely a shell command that restarts a container.

If the repository and secrets are configured, finish by showing a successful run in the GitHub Actions tab and the two image tags on Docker Hub.

## What each technology contributes

| Technology | Role |
| --- | --- |
| Git and GitHub | Source history and pipeline trigger |
| GitHub Actions | CI/CD orchestration and secret handling |
| Node.js and Express | Demonstration backend and monitoring endpoints |
| Node test runner and Supertest | Automated API verification |
| Docker | Reproducible application environment |
| Docker Hub | Versioned container registry |
| Linux and SSH | Production deployment target |
| Shell script | Deployment, health polling, and rollback logic |
| Slack webhook | Optional failure notification |

## Questions your professor may ask

### What is the difference between CI and CD here?

CI is the `test` and `container` work: every change is checked and packaged consistently. CD is the `publish` and `deploy` work: a successful main-branch build is released to the server automatically.

### Why use Docker?

Docker packages the runtime, dependencies, source code, startup command, and health check together. The image tested in CI is the same artifact deployed to the server, reducing “works on my machine” problems.

### Why use a SHA tag as well as `latest`?

`latest` is convenient for humans but changes over time. `sha-<commit>` is immutable and identifies the exact source revision. Deployment uses the SHA tag for traceability and reliable rollback.

### What happens when a test fails?

GitHub Actions stops the dependent jobs. No image is published and nothing is deployed.

### What happens when deployment succeeds but the app is broken?

The script waits for Docker’s application-level health check. If it becomes unhealthy or does not pass in time, the candidate container is removed and the previous image is started again.

### How are passwords protected?

Docker Hub credentials, SSH keys, server details, and the optional Slack webhook are stored as encrypted GitHub Actions secrets. They are not committed to the repository.

### Is the dashboard a monitoring system?

It is a demonstration and lightweight operational view. It shows current process data and endpoint latency, but it does not persist historical metrics. A production system would export metrics to Prometheus and visualize them in Grafana.

### Is deployment zero-downtime?

No. This beginner/intermediate version uses stop-and-replace deployment, which can cause a short interruption. A next iteration could place Nginx in front of blue and green containers, validate the candidate, and then switch traffic.

## Honest limitations and future improvements

- Add Nginx and blue/green deployment for zero downtime.
- Add Prometheus and Grafana for persistent metrics and alerting.
- Sign container images and verify signatures before deployment.
- Pin third-party GitHub Actions to commit hashes for stronger supply-chain security.
- Add staging and production environments with separate approval gates.
- Add database migration and backup strategies for stateful applications.
- Provision the server using Terraform or Ansible.

Mentioning these limitations demonstrates that you understand how a learning project differs from a large production platform.

## Closing statement

> “The main value of AutoDeploy is not just running a container. It converts deployment knowledge into a repeatable pipeline, verifies every release, preserves traceability, and reduces recovery time when a change is unhealthy.”
