const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

describe('AutoDeploy API', () => {
  before(() => {
    process.env.APP_VERSION = 'test-sha';
  });

  after(() => {
    delete process.env.APP_VERSION;
  });

  it('serves the operations dashboard from the root endpoint', async () => {
    const response = await request(app).get('/').expect(200);

    assert.match(response.headers['content-type'], /text\/html/);
    assert.match(response.text, /AutoDeploy/);
    assert.equal(response.headers['x-powered-by'], undefined);
  });

  it('returns application metadata from the API endpoint', async () => {
    const response = await request(app).get('/api').expect(200);

    assert.equal(response.body.name, 'AutoDeploy');
    assert.equal(response.body.version, 'test-sha');
  });

  it('reports a healthy state', async () => {
    const response = await request(app).get('/health').expect(200);

    assert.equal(response.body.status, 'healthy');
    assert.equal(response.body.version, 'test-sha');
    assert.equal(typeof response.body.uptimeSeconds, 'number');
    assert.ok(!Number.isNaN(Date.parse(response.body.timestamp)));
  });

  it('returns runtime information', async () => {
    const response = await request(app).get('/api/info').expect(200);

    assert.equal(response.body.application, 'AutoDeploy');
    assert.equal(response.body.version, 'test-sha');
    assert.match(response.body.runtime, /^v\d+/);
  });

  it('uses development defaults when release metadata is absent', async () => {
    delete process.env.APP_VERSION;
    const rootResponse = await request(app).get('/api').expect(200);
    const infoResponse = await request(app).get('/api/info').expect(200);
    process.env.APP_VERSION = 'test-sha';

    assert.equal(rootResponse.body.version, 'development');
    assert.equal(infoResponse.body.environment, 'development');
  });

  it('reports live process metrics', async () => {
    const response = await request(app).get('/api/metrics').expect(200);

    assert.ok(response.body.requestCount > 0);
    assert.equal(typeof response.body.uptimeSeconds, 'number');
    assert.equal(typeof response.body.memory.residentSetMb, 'number');
    assert.equal(typeof response.body.processId, 'number');
  });

  it('reports readiness', async () => {
    const response = await request(app).get('/ready').expect(200);

    assert.deepEqual(response.body, { status: 'ready' });
  });

  it('returns JSON for unknown routes', async () => {
    const response = await request(app).get('/missing').expect(404);

    assert.deepEqual(response.body, { error: 'Not found' });
  });
});
