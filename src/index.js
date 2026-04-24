import authRoutes from './routes/authRoutes.js';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { testConnection } from './config/supabase.js';
import userRoutes from './routes/userRoutes.js';
import recipeRoutes from './routes/recipeRoutes.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/', (req, res) => {
  res.json({
    message: 'RecipeChain API',
    version: '1.0.0',
    status: 'running'
  });
});

// Test Supabase connection
app.get('/test-db', async (req, res) => {
  try {
    const isConnected = await testConnection();

    if (isConnected) {
      res.json({
        success: true,
        message: 'Supabase connection is healthy',
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('Connection test failed');
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Error connecting to Supabase',
      error: err.message
    });
  }
});

// API routes
app.use('/api', userRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/auth', authRoutes);

// Error handler (must be after all routes)
app.use(errorHandler);

// Test Supabase connection on startup
testConnection();

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT} successfully`);
});   