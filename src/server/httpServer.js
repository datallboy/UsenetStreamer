function createHttpServer({ app, appRuntime, serverHost = '0.0.0.0' }) {
  const state = {
    serverInstance: null,
  };

  function startHttpServer() {
    if (state.serverInstance) {
      return state.serverInstance;
    }
    const port = appRuntime.getCurrentPort();
    state.serverInstance = app.listen(port, serverHost, () => {
      console.log(`Addon running at http://${serverHost}:${port}`);
    });
    state.serverInstance.on('close', () => {
      state.serverInstance = null;
    });
    return state.serverInstance;
  }

  async function restartHttpServer() {
    if (!state.serverInstance) {
      startHttpServer();
      return;
    }
    await new Promise((resolve, reject) => {
      state.serverInstance.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    startHttpServer();
  }

  return {
    startHttpServer,
    restartHttpServer,
  };
}

module.exports = {
  createHttpServer,
};
