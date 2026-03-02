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

test('getStreamsUseCase uses integration pipeline executor when provided', async () => {
  const req = {
    params: { type: 'movie', id: 'tt7654321' },
    query: {},
  };
  const res = {};
  const calls = [];

  const useCase = createGetStreamsUseCase({
    handlers: {
      legacyStreamHandler: async () => {
        calls.push('legacy');
      },
    },
    integrations: {
      pipeline: {
        execute: async (incomingReq) => {
          calls.push('pipeline');
          assert.ok(incomingReq.streamV2Context);
        },
      },
    },
  });

  await useCase(req, res);

  assert.deepEqual(calls, ['pipeline']);
  assert.equal(req.streamV2Context.request.id, 'tt7654321');
});
