import { Router } from 'express';

const router = Router();

router.get('/reputation', (req, res) => {
  res.json({
    g2_rating: 4.4,
    trustpilot_rating: 4.1,
    recent_reviews_count: 12,
    negative_reviews_summary: 'Users report slow support response times',
    competitor_g2: 4.6,
    scraped_at: new Date()
  });
});

export default router;
