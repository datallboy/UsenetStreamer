function createHttpServerLifecycle({ app, host, getPort, onListen }) {
  let serverInstance = null;

  function startHttpServer() {
    if (serverInstance) {
      return serverInstance;
    }
    const port = getPort();
    serverInstance = app.listen(port, host, () => {
      if (typeof onListen === 'function') {
        onListen({ host, port });
      }
    });
    serverInstance.on('close', () => {
      serverInstance = null;
    });
    return serverInstance;
  }

  async function restartHttpServer() {
    if (!serverInstance) {
      startHttpServer();
      return;
    }
    await new Promise((resolve, reject) => {
      serverInstance.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
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
  createHttpServerLifecycle,
};
