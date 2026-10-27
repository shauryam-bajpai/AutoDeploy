const express = require('express');
const helmet = require('helmet');
const path = require('node:path');

const app = express();
let requestCount = 0;

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
