const http = require('node:http');
const app = require('./app');

const port = Number.parseInt(process.env.PORT || '3000', 10);
const server = http.createServer(app);

server.listen(port, '0.0.0.0', () => {
  console.log(`AutoDeploy listening on port ${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down gracefully`);

  server.close((error) => {
    if (error) {
      console.error('Graceful shutdown failed', error);
      process.exit(1);
    }

    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
