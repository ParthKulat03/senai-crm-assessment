import { Router } from 'express';
import { retrieveRelevantChunks } from '../services/ragPipeline.js';

const router = Router();

router.get('/search', async (req, res) => {
  const { q = '' } = req.query as { q?: string };
  const chunks = await retrieveRelevantChunks(q, 5);
  res.json(chunks);
});

export default router;
