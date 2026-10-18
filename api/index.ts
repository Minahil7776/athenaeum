import express from 'express';
import app from '../server.js';

const api = express();

api.use((req, _res, next) => {
  const url = new URL(req.originalUrl, 'http://localhost');
  const path = url.searchParams.get('path');

  if (path !== null) {
    url.searchParams.delete('path');
    req.url = `/api/${path}${url.search}`;
  }

  next();
});

api.use(app);

export default api;
