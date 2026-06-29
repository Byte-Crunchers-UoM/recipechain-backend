import express from 'express';
import {
  getReportedReviews,
  approveReview,
  removeReview,
  resolveReview
} from '../controllers/adminReviewController.js';

const router = express.Router();

// GET /api/admin/reviews/reported
router.get('/reported', getReportedReviews);

// PATCH /api/admin/reviews/:id/approve
router.patch('/:id/approve', approveReview);

// PATCH /api/admin/reviews/:id/remove
router.patch('/:id/remove', removeReview);

// PATCH /api/admin/reviews/:id/resolve
router.patch('/:id/resolve', resolveReview);

export default router;
