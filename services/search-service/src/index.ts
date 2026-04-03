import express from 'express';
import { createLogger } from '@resume-score/logger';

const logger = createLogger({ service: 'search-service' });
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'search-service' });
});

/**
 * Full-text search over resumes
 * GET /search/resumes?q=software+engineer&userId=xxx
 */
app.get('/search/resumes', async (req, res) => {
  const { q, userId } = req.query as Record<string, string>;
  logger.info({ q, userId }, 'Resume search');
  // TODO: query Elasticsearch / vector DB
  res.json({ success: true, data: { items: [], total: 0, query: q } });
});

/**
 * Semantic similarity search
 * POST /search/similar  { resumeId, topK }
 */
app.post('/search/similar', async (req, res) => {
  const { resumeId, topK = 5 } = req.body as { resumeId: string; topK?: number };
  logger.info({ resumeId, topK }, 'Semantic similarity search');
  // TODO: fetch embedding, search vector DB
  res.json({ success: true, data: { similar: [], resumeId } });
});

const PORT = process.env['PORT'] ?? 3005;
app.listen(PORT, () => {
  logger.info({ port: PORT }, '🚀 Search service started');
});

export default app;
