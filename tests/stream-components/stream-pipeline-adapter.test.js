const test = require('node:test');
const assert = require('node:assert/strict');

const { createLegacyStreamPipelineAdapter } = require('../../src/integrations/stream/createLegacyStreamPipelineAdapter');

test('createLegacyStreamPipelineAdapter proxies execute to legacy stream handler', async () => {
  const req = { path: '/stream/movie/tt1.json' };
  const res = { ok: true };
  const calls = [];
  const adapter = createLegacyStreamPipelineAdapter({
    legacyStreamHandler: async (incomingReq, incomingRes) => {
      calls.push([incomingReq, incomingRes]);
    },
  });

  await adapter.execute(req, res);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], req);
  assert.equal(calls[0][1], res);
});
