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
  clock: document.querySelector('#clock')
};

const latencyHistory = [];
const activityHistory = [];
let checkInProgress = false;

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
setInterval(updateClock, 1000);
setInterval(runSystemCheck, 5000);
