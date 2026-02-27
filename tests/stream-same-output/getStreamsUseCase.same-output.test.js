const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGetStreamsUseCase } = require('../../src/services/stream/getStreamsUseCase');

const fixturesPath = path.resolve(__dirname, 'fixtures', 'cases.json');
const cases = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildRequest(fixtureCase) {
  return {
    params: clone(fixtureCase.request?.params || {}),
    query: clone(fixtureCase.request?.query || {}),
    headers: {},
  };
}

function createResponseCapture() {
  const state = {
    statusCode: 200,
    headers: {},
    payload: undefined,
    sendPayload: undefined,
  };

  const res = {
    status(code) {
      state.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      state.headers[String(name).toLowerCase()] = value;
      return this;
    },
    json(body) {
      state.payload = body;
      return this;
    },
    send(body) {
      state.sendPayload = body;
      return this;
    },
  };

  return { res, state };
}

async function execute(handler, fixtureCase) {
  const req = buildRequest(fixtureCase);
  const { res, state } = createResponseCapture();
  await handler(req, res);
  return {
    statusCode: state.statusCode,
    payload: state.payload,
    sendPayload: state.sendPayload,
    headers: state.headers,
  };
}

test('stream same-output: wrapped handler matches legacy handler fixtures', async () => {
  let invocationCount = 0;

  for (const fixtureCase of cases) {
    const legacyHandler = async (_req, res) => {
      invocationCount += 1;
      const response = fixtureCase.response || {};
      const statusCode = Number.isFinite(Number(response.status)) ? Number(response.status) : 200;
      res.status(statusCode).json(clone(response.body || {}));
    };
    const wrappedHandler = createGetStreamsUseCase({
      handlers: {
        legacyStreamHandler: legacyHandler,
      },
    });

    const legacyResult = await execute(async (req, res) => {
      return legacyHandler(req, res);
    }, fixtureCase);
    const wrappedResult = await execute(wrappedHandler, fixtureCase);

    assert.deepStrictEqual(
      wrappedResult,
      legacyResult,
      `Wrapped output diverged from legacy output for fixture: ${fixtureCase.id}`
    );

    assert.deepStrictEqual(
      wrappedResult,
      {
        statusCode: fixtureCase.response.status,
        payload: fixtureCase.response.body,
        sendPayload: undefined,
        headers: {},
      },
      `Output did not match expected fixture for case: ${fixtureCase.id}`
    );
  }

  assert.equal(
    invocationCount,
    cases.length * 2,
    'Expected legacy handler to be called for both legacy and wrapped executions'
  );
});
