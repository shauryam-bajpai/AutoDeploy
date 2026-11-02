const express = require('express');
const helmet = require('helmet');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
let requestCount = 0;
const pipelineStatusFile = process.env.PIPELINE_STATUS_FILE
  || path.join(__dirname, '..', '.demo-state', 'pipeline-status.json');

const emptyPipelineStatus = {
  schemaVersion: 2,
  mode: 'guided-local-demo',
  runId: null,
  status: 'idle',
  activeCommand: null,
  nextCommand: 'prepare',
  message: 'Start with npm.cmd run demo:prepare',
  events: [],
  stages: [
    { id: 'code', status: 'pending', detail: 'Waiting' },
    { id: 'test', status: 'pending', detail: 'Waiting' },
    { id: 'build', status: 'pending', detail: 'Waiting' },
    { id: 'publish', status: 'pending', detail: 'Waiting' },
    { id: 'deploy', status: 'pending', detail: 'Waiting' },
    { id: 'verify', status: 'pending', detail: 'Waiting' }
  ]
};

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use((_request, _response, next) => {
  requestCount += 1;
  next();
});

app.get('/api', (_request, response) => {
  response.json({
    name: 'AutoDeploy',
    message: 'Automated CI/CD is running successfully.',
    version: process.env.APP_VERSION || 'development',
    documentation: '/api/info',
    health: '/health'
  });
});

app.get('/api/info', (_request, response) => {
  response.json({
    application: 'AutoDeploy',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || 'development',
    runtime: process.version
  });
});

app.get('/api/metrics', (_request, response) => {
  const memory = process.memoryUsage();

  response.json({
    requestCount,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      residentSetMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(1))
    },
    processId: process.pid
  });
});

app.get('/api/pipeline', (_request, response) => {
  response.set('Cache-Control', 'no-store');

  try {
    const status = JSON.parse(fs.readFileSync(pipelineStatusFile, 'utf8'));
    response.json(status);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Unable to read local pipeline status', error);
    }
    response.json(emptyPipelineStatus);
  }
});

app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: process.env.APP_VERSION || 'development'
  });
});

app.get('/ready', (_request, response) => {
  response.status(200).json({ status: 'ready' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

// Keep unexpected error details out of production responses.
// eslint-disable-next-line no-unused-vars
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
