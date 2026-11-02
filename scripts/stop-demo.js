const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const stateFile = path.join(projectRoot, '.demo-state', 'pipeline-status.json');
const result = spawnSync('docker', ['rm', '--force', 'autodeploy-demo'], {
  cwd: projectRoot,
  encoding: 'utf8',
  windowsHide: true
});

if (result.status === 0) {
  console.log('Stopped and removed the local demonstration container.');
} else {
  console.log('No local demonstration container was running.');
}

fs.rmSync(stateFile, { force: true });
console.log('Reset the dashboard pipeline display.');
