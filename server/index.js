const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and body parsers
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith('/api')) {
      console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API routes
app.use('/api', apiRouter);

// Serve static assets from React client build if exists
const clientDistPath = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Fallback to client index.html for SPA routing
app.get('*', (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.send('Corvo Engineering PR-to-PO API Server is running. Client build in progress.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=====================================================`);
  console.log(`🚀 Corvo PR-to-PO Engine Server running on port ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`📋 API Base: http://localhost:${PORT}/api`);
  console.log(`=====================================================`);
});
