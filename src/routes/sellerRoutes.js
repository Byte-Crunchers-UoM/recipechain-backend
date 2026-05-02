// src/routes/sellerRoutes.js
import express from 'express';
import { 
  createSeller, 
  getAllSellers, 
  getSellerById, 
  updateSeller, 
  deleteSeller,
  verifySeller
} from '../controllers/sellerController.js';

const router = express.Router();

router.post('/', createSeller);
router.get('/', getAllSellers);
router.get('/:id', getSellerById);
router.put('/:id', updateSeller);
router.delete('/:id', deleteSeller);
router.patch('/:id/verify', verifySeller);

export default router;