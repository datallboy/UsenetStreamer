const test = require('node:test');
const assert = require('node:assert/strict');

const { createGetStreamsUseCase } = require('../../src/services/stream/getStreamsUseCase');

test('getStreamsUseCase populates streamV2Context and delegates to legacy handler', async () => {
  const req = {
    params: { type: 'movie', id: 'tt1234567' },
    query: { quality: '1080p' },
  };
  const res = {};
  let delegated = false;

  const useCase = createGetStreamsUseCase({
    handlers: {
      legacyStreamHandler: async (incomingReq) => {
        delegated = true;
        assert.ok(incomingReq.streamV2Context);
      },
    },
  });

  await useCase(req, res);

  assert.equal(delegated, true);
  assert.equal(req.streamV2Context.request.type, 'movie');
  assert.equal(req.streamV2Context.identifiers.incomingImdbId, 'tt1234567');
});
