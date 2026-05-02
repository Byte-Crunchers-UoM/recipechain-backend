import express from 'express';
import { 
  createBuyer, 
  getAllBuyers, 
  getBuyerById, 
  updateBuyer, 
  deleteBuyer,
  updateBuyerStatus 
} from '../controllers/buyerController.js';

const router = express.Router();

// CRUD Routes for testing
router.post('/', createBuyer);       // Create
router.get('/', getAllBuyers);       // Read All
router.get('/:id', getBuyerById);   // Read Single
router.put('/:id', updateBuyer);    // Update
router.delete('/:id', deleteBuyer); // Delete
router.patch('/:id/status', updateBuyerStatus); // Update Status

export default router;