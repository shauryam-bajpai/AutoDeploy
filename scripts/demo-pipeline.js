const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const stateDirectory = path.join(projectRoot, '.demo-state');
const stateFile = path.join(stateDirectory, 'pipeline-status.json');
const dashboardUrl = 'http://127.0.0.1:3000';
const deploymentUrl = 'http://127.0.0.1:3001';
const demoContainer = 'autodeploy-demo';
const minimumStageDuration = 900;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const stageDefinitions = [
  { id: 'code', name: 'Code source' },
  { id: 'test', name: 'Test' },
  { id: 'build', name: 'Build' },
  { id: 'publish', name: 'Publish locally' },
  { id: 'deploy', name: 'Deploy locally' },
  { id: 'verify', name: 'Verify' }
];

const commandDefinitions = {
  prepare: { label: 'Prepare', command: `${npmCommand} run demo:prepare`, requires: [] },
  test: { label: 'Test', command: `${npmCommand} run demo:test`, requires: ['code'] },
  build: { label: 'Build & package', command: `${npmCommand} run demo:build`, requires: ['test'] },
  deploy: { label: 'Deploy', command: `${npmCommand} run demo:deploy`, requires: ['build', 'publish'] },
  verify: { label: 'Verify', command: `${npmCommand} run demo:verify`, requires: ['deploy'] }
};

fs.mkdirSync(stateDirectory, { recursive: true });

function createState() {
  return {
    schemaVersion: 2,
    mode: 'guided-local-demo',
    runId: `demo-${Date.now()}`,
    status: 'idle',
    activeCommand: null,
    nextCommand: 'prepare',
    message: `Start with ${commandDefinitions.prepare.command}`,
    startedAt: null,
    updatedAt: new Date().toISOString(),
    completedAt: null,
    targetUrl: deploymentUrl,
    commit: null,
    releaseImage: null,
    events: [],
    stages: stageDefinitions.map((stage) => ({
      ...stage,
      status: 'pending',
      detail: 'Waiting',
      durationMs: null
    }))
  };
}

function loadState() {
  try {
    const savedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (savedState.schemaVersion === 2) return savedState;
  } catch {
    // A missing or older state file starts a fresh guided demonstration.
  }
  return createState();
}

let state = loadState();

function writeState() {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function addEvent(message, level = 'info') {
  state.events.push({ message, level, timestamp: new Date().toISOString() });
  state.events = state.events.slice(-10);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let executable = command;
    let commandArguments = args;

    if (process.platform === 'win32' && command === 'npm') {
      if (process.env.npm_execpath) {
        executable = process.execPath;
        commandArguments = [process.env.npm_execpath, ...args];
      } else {
        executable = process.env.ComSpec || 'cmd.exe';
        commandArguments = ['/d', '/s', '/c', 'npm.cmd', ...args];
      }
    }

    const child = spawn(executable, commandArguments, {
      cwd: projectRoot,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';

    if (options.capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const error = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
      error.exitCode = code;
      error.stderr = stderr.trim();
      reject(error);
    });
  });
}

async function commandSucceeds(command, args) {
  try {
    await runCommand(command, args, { capture: true });
    return true;
  } catch {
    return false;
  }
}

function getJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${url} returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`${url} did not return JSON`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`${url} timed out`)));
    request.on('error', reject);
  });
}

async function waitForJson(url, attempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await getJson(url);
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError;
}

async function ensureDashboard(forceRebuild = false) {
  if (!forceRebuild) {
    try {
      const pipeline = await getJson(`${dashboardUrl}/api/pipeline`);
      if (pipeline.schemaVersion === 2) return;
    } catch {
      // Build the dashboard below when it is absent or outdated.
    }
  }
  console.log('\nPreparing the dashboard container...');
  await runCommand('docker', ['compose', 'up', '--build', '--detach', '--force-recreate']);
  await waitForJson(`${dashboardUrl}/api/pipeline`, 30);
}

function stageById(id) {
  return state.stages.find((stage) => stage.id === id);
}

function requireStages(commandName) {
  const missing = commandDefinitions[commandName].requires.filter(
    (id) => stageById(id)?.status !== 'completed'
  );
  if (missing.length > 0) {
    const suggestions = {
      code: commandDefinitions.prepare.command,
      test: commandDefinitions.test.command,
      build: commandDefinitions.build.command,
      publish: commandDefinitions.build.command,
      deploy: commandDefinitions.deploy.command
    };
    throw new Error(`Pipeline order check failed. Run "${suggestions[missing[0]]}" first.`);
  }
}

function resetFrom(stageId) {
  const startIndex = state.stages.findIndex((stage) => stage.id === stageId);
  state.stages.slice(startIndex).forEach((stage) => {
    stage.status = 'pending';
    stage.detail = 'Waiting';
    stage.durationMs = null;
  });
  state.completedAt = null;
}

async function runStage(id, action) {
  const stage = stageById(id);
  const startedAt = Date.now();
  stage.status = 'running';
  stage.detail = 'In progress';
  state.status = 'running';
  state.message = `${stage.name} is running...`;
  addEvent(`${stage.name} started`);
  writeState();
  console.log(`\n[${state.stages.indexOf(stage) + 1}/${stageDefinitions.length}] ${stage.name}`);

  try {
    const detail = await action();
    const elapsed = Date.now() - startedAt;
    if (elapsed < minimumStageDuration) await sleep(minimumStageDuration - elapsed);
    stage.status = 'completed';
    stage.detail = detail;
    stage.durationMs = Date.now() - startedAt;
    addEvent(`${stage.name} completed`, 'success');
    writeState();
  } catch (error) {
    stage.status = 'failed';
    stage.detail = error.stderr || error.message;
    stage.durationMs = Date.now() - startedAt;
    state.status = 'failed';
    state.message = `${stage.name} failed. Fix the error and repeat this command.`;
    state.activeCommand = null;
    addEvent(`${stage.name} failed`, 'error');
    writeState();
    throw error;
  }
}

function finishCommand(commandName, nextCommand, message) {
  state.activeCommand = null;
  state.nextCommand = nextCommand;
  state.status = nextCommand ? 'waiting' : 'completed';
  state.message = message;
  if (!nextCommand) state.completedAt = new Date().toISOString();
  addEvent(`${commandDefinitions[commandName].label} command passed`, 'success');
  writeState();
}

async function prepare() {
  state = createState();
  state.status = 'running';
  state.activeCommand = 'prepare';
  state.startedAt = new Date().toISOString();
  state.message = 'Preparing dashboard and reading the source revision...';
  addEvent('Guided demonstration started');
  writeState();
  await ensureDashboard(true);

  if (await commandSucceeds('docker', ['container', 'inspect', demoContainer])) {
    await runCommand('docker', ['rm', '--force', demoContainer]);
  }
  await runStage('code', async () => {
    state.commit = await runCommand('git', ['rev-parse', '--short', 'HEAD'], { capture: true });
    return `Commit ${state.commit}`;
  });
  finishCommand('prepare', 'test', `Prepared. Next: ${commandDefinitions.test.command}`);
}

async function test() {
  await ensureDashboard();
  requireStages('test');
  resetFrom('test');
  state.activeCommand = 'test';
  writeState();
  await runStage('test', async () => {
    await runCommand('npm', ['run', 'check']);
    await runCommand('npm', ['run', 'test:coverage']);
    return 'Checks and tests passed';
  });
  finishCommand('test', 'build', `Quality gate passed. Next: ${commandDefinitions.build.command}`);
}

async function build() {
  await ensureDashboard();
  requireStages('build');
  resetFrom('build');
  state.activeCommand = 'build';
  writeState();
  await runStage('build', async () => {
    await runCommand('docker', ['build', '--tag', 'autodeploy:demo', '.']);
    return 'Production image built';
  });
  await runStage('publish', async () => {
    const commit = state.commit || 'working-tree';
    state.releaseImage = `autodeploy:demo-${commit}`;
    await runCommand('docker', ['tag', 'autodeploy:demo', state.releaseImage]);
    return `Local tag demo-${commit}`;
  });
  finishCommand('build', 'deploy', `Image packaged locally. Next: ${commandDefinitions.deploy.command}`);
}

async function deploy() {
  await ensureDashboard();
  requireStages('deploy');
  resetFrom('deploy');
  state.activeCommand = 'deploy';
  writeState();
  await runStage('deploy', async () => {
    if (await commandSucceeds('docker', ['container', 'inspect', demoContainer])) {
      await runCommand('docker', ['rm', '--force', demoContainer]);
    }
    await runCommand('docker', [
      'run', '--detach', '--rm', '--name', demoContainer,
      '--publish', '127.0.0.1:3001:3000',
      '--env', `APP_VERSION=demo-${state.commit || 'working-tree'}`,
      '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL',
      state.releaseImage || 'autodeploy:demo'
    ]);
    return 'Container deployed on port 3001';
  });
  finishCommand('deploy', 'verify', `Container deployed. Next: ${commandDefinitions.verify.command}`);
}

async function verify() {
  await ensureDashboard();
  requireStages('verify');
  resetFrom('verify');
  state.activeCommand = 'verify';
  writeState();
  await runStage('verify', async () => {
    const health = await waitForJson(`${deploymentUrl}/health`, 30);
    if (health.status !== 'healthy') throw new Error(`Unexpected health status: ${health.status}`);
    return `Healthy - ${health.version}`;
  });
  finishCommand('verify', null, 'All five commands passed. The demo release is healthy.');
}

async function runSelectedCommand(commandName) {
  const handlers = { prepare, test, build, deploy, verify };
  if (!handlers[commandName]) throw new Error(`Unknown demo command: ${commandName}`);
  console.log(`\nAutoDeploy guided demo - ${commandDefinitions[commandName].label}`);
  await handlers[commandName]();
  console.log(`\nPASS: ${commandDefinitions[commandName].label}`);
  console.log(`Dashboard: ${dashboardUrl}`);
  if (state.nextCommand) console.log(`Next:      ${commandDefinitions[state.nextCommand].command}`);
}

async function main() {
  const requestedCommand = process.argv[2] || 'all';
  if (requestedCommand === 'all') {
    for (const commandName of Object.keys(commandDefinitions)) await runSelectedCommand(commandName);
    console.log(`Deployment: ${deploymentUrl}`);
    console.log(`Cleanup:    ${npmCommand} run demo:stop`);
    return;
  }
  await runSelectedCommand(requestedCommand);
  if (requestedCommand === 'verify') {
    console.log(`Deployment: ${deploymentUrl}`);
    console.log(`Cleanup:    ${npmCommand} run demo:stop`);
  }
}

main().catch((error) => {
  console.error(`\nFAIL: ${error.message}`);
  console.error('The dashboard shows the failed or missing stage.');
  process.exitCode = 1;
});
