import express from 'express';
import { createLogger } from '@resume-score/logger';
import { generateId } from '@resume-score/common';

const logger = createLogger({ service: 'user-service' });
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'user-service' });
});

app.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  logger.info({ userId: id }, 'Get user by ID');
  // TODO: fetch from database
  res.json({ success: true, data: { id } });
});

app.patch('/users/:id', async (req, res) => {
  const { id } = req.params;
  logger.info({ userId: id, body: req.body }, 'Update user');
  // TODO: update in database + publish user.updated event
  res.json({ success: true, data: { id, ...req.body } });
});

const PORT = process.env['PORT'] ?? 3003;
app.listen(PORT, () => {
  logger.info({ port: PORT }, '🚀 User service started');
});

export default app;
