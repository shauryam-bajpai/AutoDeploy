const elements = {
  button: document.querySelector('#run-check'),
  healthCore: document.querySelector('#health-core'),
  heroStatus: document.querySelector('#hero-status'),
  responseTime: document.querySelector('#response-time'),
  responseCaption: document.querySelector('#response-caption'),
  uptime: document.querySelector('#uptime'),
  memory: document.querySelector('#memory'),
  requests: document.querySelector('#requests'),
  healthState: document.querySelector('#health-state'),
  readyState: document.querySelector('#ready-state'),
  infoState: document.querySelector('#info-state'),
  lastChecked: document.querySelector('#last-checked'),
  latencyValue: document.querySelector('#latency-value'),
  latencyChart: document.querySelector('#latency-chart'),
  version: document.querySelector('#version'),
  environment: document.querySelector('#environment'),
  runtime: document.querySelector('#runtime'),
  activity: document.querySelector('#activity-list'),
  clock: document.querySelector('#clock'),
  pipelineBadge: document.querySelector('#pipeline-badge'),
  pipelineMessage: document.querySelector('#pipeline-message'),
  pipelineStages: document.querySelectorAll('[data-pipeline-stage]'),
  commandChips: document.querySelectorAll('[data-demo-command]'),
  pipelineProgress: document.querySelector('#pipeline-progress'),
  pipelineProgressFill: document.querySelector('#pipeline-progress-fill'),
  pipelineProgressLabel: document.querySelector('#pipeline-progress-label'),
  pipelineProgressPercent: document.querySelector('#pipeline-progress-percent'),
  pipelineEvents: document.querySelector('#pipeline-events'),
  pipelineRunId: document.querySelector('#pipeline-run-id')
};

const latencyHistory = [];
const activityHistory = [];
let checkInProgress = false;
let lastPipelineRun = null;
let lastPipelineStatus = null;

function formatUptime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${totalSeconds % 60}s`;
}

async function timedFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  const started = performance.now();

  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const data = await response.json();
    return { ok: response.ok, data, latency: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timeout);
  }
}

function setEndpointState(element, healthy) {
  element.textContent = healthy ? '200 OK' : 'Failed';
  element.className = `endpoint-state ${healthy ? 'healthy' : 'failed'}`;
}

function renderLatency() {
  const maximum = Math.max(...latencyHistory, 50);
  elements.latencyChart.replaceChildren();

  const paddedValues = [...Array(Math.max(0, 16 - latencyHistory.length)).fill(null), ...latencyHistory];
  paddedValues.forEach((latency) => {
    const bar = document.createElement('span');
    bar.className = latency === null ? 'empty' : '';
    bar.style.height = latency === null ? '15%' : `${Math.max(18, Math.round((latency / maximum) * 100))}%`;
    if (latency !== null) bar.title = `${latency} ms`;
    elements.latencyChart.append(bar);
  });
}

function addActivity(message, successful) {
  activityHistory.unshift({ message, successful, time: new Date() });
  activityHistory.splice(5);
  elements.activity.replaceChildren();

  activityHistory.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'activity-row';

    const indicator = document.createElement('span');
    indicator.className = item.successful ? 'activity-success' : 'activity-failure';
    indicator.textContent = item.successful ? '✓' : '!';

    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.message;
    const detail = document.createElement('small');
    detail.textContent = item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    text.append(title, detail);
    row.append(indicator, text);
    elements.activity.append(row);
  });
}

function renderPipeline(pipeline) {
  const stages = new Map(pipeline.stages.map((stage) => [stage.id, stage]));
  const completedCount = pipeline.stages.filter((stage) => stage.status === 'completed').length;
  const progress = Math.round((completedCount / pipeline.stages.length) * 100);

  elements.pipelineStages.forEach((stageElement) => {
    const stage = stages.get(stageElement.dataset.pipelineStage);
    if (!stage) return;

    stageElement.classList.remove('pending', 'running', 'completed', 'failed');
    stageElement.classList.add(stage.status);
    const detail = stageElement.querySelector('small');
    detail.textContent = stage.detail;
    detail.title = stage.detail;

    const connector = stageElement.nextElementSibling;
    if (connector?.classList.contains('pipeline-connector')) {
      connector.classList.toggle('completed', stage.status === 'completed');
      connector.classList.toggle('running', stage.status === 'running');
    }
  });

  const labels = {
    idle: 'Ready for demo',
    running: 'Pipeline running',
    waiting: 'Awaiting command',
    completed: 'All stages passed',
    failed: 'Pipeline failed'
  };
  elements.pipelineBadge.textContent = labels[pipeline.status] || pipeline.status;
  elements.pipelineBadge.dataset.status = pipeline.status;
  elements.pipelineMessage.textContent = pipeline.message;
  elements.pipelineProgressFill.style.width = `${progress}%`;
  elements.pipelineProgressLabel.textContent = `${completedCount} of ${pipeline.stages.length} stages`;
  elements.pipelineProgressPercent.textContent = `${progress}%`;
  elements.pipelineProgress.setAttribute('aria-valuenow', String(progress));
  elements.pipelineRunId.textContent = pipeline.runId ? pipeline.runId.replace('demo-', 'Run ') : 'No active run';

  const commandStages = {
    prepare: ['code'],
    test: ['test'],
    build: ['build', 'publish'],
    deploy: ['deploy'],
    verify: ['verify']
  };
  elements.commandChips.forEach((chip) => {
    const command = chip.dataset.demoCommand;
    const stageIds = commandStages[command];
    const completed = stageIds.every((id) => stages.get(id)?.status === 'completed');
    chip.classList.toggle('completed', completed);
    chip.classList.toggle('active', pipeline.activeCommand === command);
    chip.classList.toggle('next', !completed && pipeline.nextCommand === command && !pipeline.activeCommand);
  });

  elements.pipelineEvents.replaceChildren();
  const events = (pipeline.events || []).slice(-5).reverse();
  if (events.length === 0) {
    const empty = document.createElement('p');
    const time = document.createElement('time');
    const message = document.createElement('span');
    time.textContent = '--:--:--';
    message.textContent = 'Waiting for the prepare command';
    empty.append(time, message);
    elements.pipelineEvents.append(empty);
  } else {
    events.forEach((event) => {
      const row = document.createElement('p');
      row.className = event.level || 'info';
      const time = document.createElement('time');
      time.textContent = new Date(event.timestamp).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const message = document.createElement('span');
      message.textContent = event.message;
      row.append(time, message);
      elements.pipelineEvents.append(row);
    });
  }

  if (pipeline.runId !== lastPipelineRun || pipeline.status !== lastPipelineStatus) {
    if (pipeline.status === 'completed') addActivity('Local pipeline completed', true);
    if (pipeline.status === 'failed') addActivity('Local pipeline failed', false);
    lastPipelineRun = pipeline.runId;
    lastPipelineStatus = pipeline.status;
  }
}

async function refreshPipeline() {
  try {
    const response = await timedFetch('/api/pipeline');
    if (response.ok) renderPipeline(response.data);
  } catch {
    elements.pipelineBadge.textContent = 'Status unavailable';
  }
}

async function runSystemCheck(manual = false) {
  if (checkInProgress) return;
  checkInProgress = true;
  elements.button.disabled = true;
  elements.button.classList.add('loading');

  try {
    const [health, readiness, info, metrics] = await Promise.all([
      timedFetch('/health'),
      timedFetch('/ready'),
      timedFetch('/api/info'),
      timedFetch('/api/metrics')
    ]);

    const healthy = health.ok && health.data.status === 'healthy';
    const ready = readiness.ok && readiness.data.status === 'ready';
    const informationAvailable = info.ok;
    const allHealthy = healthy && ready && informationAvailable && metrics.ok;
    const latency = Math.max(health.latency, readiness.latency, info.latency, metrics.latency);

    setEndpointState(elements.healthState, healthy);
    setEndpointState(elements.readyState, ready);
    setEndpointState(elements.infoState, informationAvailable);

    elements.healthCore.classList.toggle('unhealthy', !allHealthy);
    elements.heroStatus.textContent = allHealthy ? 'Healthy' : 'Attention';
    elements.responseTime.textContent = `${latency} ms`;
    elements.responseCaption.textContent = latency < 200 ? 'Within target' : 'Above 200 ms target';
    elements.latencyValue.textContent = `${latency} ms`;
    elements.uptime.textContent = formatUptime(metrics.data.uptimeSeconds);
    elements.memory.textContent = `${metrics.data.memory.residentSetMb} MB`;
    elements.requests.textContent = metrics.data.requestCount.toLocaleString();
    elements.version.textContent = info.data.version;
    elements.environment.textContent = info.data.environment;
    elements.runtime.textContent = info.data.runtime;
    elements.lastChecked.textContent = `Checked ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

    latencyHistory.push(latency);
    if (latencyHistory.length > 16) latencyHistory.shift();
    renderLatency();

    if (manual || activityHistory.length === 0) {
      addActivity(allHealthy ? 'All system checks passed' : 'A system check failed', allHealthy);
    }
  } catch (error) {
    elements.healthCore.classList.add('unhealthy');
    elements.heroStatus.textContent = 'Offline';
    elements.responseTime.textContent = '--';
    elements.responseCaption.textContent = 'Endpoint unavailable';
    [elements.healthState, elements.readyState, elements.infoState].forEach((element) => setEndpointState(element, false));
    addActivity(error.name === 'AbortError' ? 'System check timed out' : 'Application is unreachable', false);
  } finally {
    checkInProgress = false;
    elements.button.disabled = false;
    elements.button.classList.remove('loading');
  }
}

function updateClock() {
  elements.clock.textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

elements.button.addEventListener('click', () => runSystemCheck(true));
updateClock();
renderLatency();
runSystemCheck();
refreshPipeline();
setInterval(updateClock, 1000);
setInterval(refreshPipeline, 750);
setInterval(runSystemCheck, 5000);
