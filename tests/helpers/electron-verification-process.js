const { spawnSync } = require('node:child_process');

const retryDelay = new Int32Array(new SharedArrayBuffer(4));

function spawnElectronSync(command, args, options) {
  let result;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    result = spawnSync(command, args, options);
    if (result.error?.code !== 'EBUSY') return result;
    Atomics.wait(retryDelay, 0, 0, 500);
  }
  return result;
}

function electronResultDetails(result) {
  return [
    `status: ${String(result.status)}`,
    `signal: ${String(result.signal)}`,
    `timeout: ${result.error?.code === 'ETIMEDOUT'}`,
    `error: ${result.error ? `${result.error.name}: ${result.error.message}` : 'none'}`,
    `stdout:\n${result.stdout || ''}`,
    `stderr:\n${result.stderr || ''}`,
  ].join('\n');
}

module.exports = { electronResultDetails, spawnElectronSync };
