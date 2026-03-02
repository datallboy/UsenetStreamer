const test = require('node:test');
const assert = require('node:assert/strict');

const { createStreamHandler } = require('../../src/controllers/stream/streamController');

test('createStreamHandler delegates to legacy handler when STREAM_V2 flag is disabled', async () => {
  const req = {};
  const res = {};
  const calls = [];
  const handler = createStreamHandler({
    getStreamV2Enabled: () => false,
    streamHandlerV2: async () => {
      calls.push('v2');
    },
    legacyStreamHandler: async () => {
      calls.push('legacy');
    },
  });

  await handler(req, res);
  assert.deepEqual(calls, ['legacy']);
});

test('createStreamHandler delegates to v2 handler when STREAM_V2 flag is enabled', async () => {
  const req = {};
  const res = {};
  const calls = [];
  const handler = createStreamHandler({
    getStreamV2Enabled: () => true,
    streamHandlerV2: async () => {
      calls.push('v2');
    },
    legacyStreamHandler: async () => {
      calls.push('legacy');
    },
  });

  await handler(req, res);
  assert.deepEqual(calls, ['v2']);
});
