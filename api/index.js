let app;
let initError = null;

try {
  app = require('../backend/server');
} catch (err) {
  console.error('Vercel Server Init Error:', err);
  initError = err;
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      error: 'Vercel Server Initialization Failed',
      message: initError.message,
      stack: initError.stack
    });
  }
  if (typeof app === 'function') {
    return app(req, res);
  }
  return res.status(500).json({ error: 'Express app is not a valid function handler' });
};
