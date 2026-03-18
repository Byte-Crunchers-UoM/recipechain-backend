import express from 'express';
import { 
  createBuyer, 
  getAllBuyers, 
  getBuyerById, 
  updateBuyer, 
  deleteBuyer 
} from '../controllers/buyerController.js';

const router = express.Router();

// CRUD Routes for testing
router.post('/buyers', createBuyer);       // Create
router.get('/buyers', getAllBuyers);       // Read All
router.get('/buyers/:id', getBuyerById);   // Read Single
router.put('/buyers/:id', updateBuyer);    // Update
router.delete('/buyers/:id', deleteBuyer); // Delete

export default router;