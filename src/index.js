import authRoutes from './routes/authRoutes.js';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { testConnection } from './config/supabase.js';
import userRoutes from './routes/userRoutes.js';
import recipeRoutes from './routes/recipeRoutes.js';
import followedChefsRoutes from './routes/followedChefsRoutes.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'], // Allow all frontend ports
  credentials: true, // Allow cookies/sessions
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

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

// API routes grouped under /api
const apiRouter = express.Router();
apiRouter.use('/users', userRoutes); // Becomes /api/users
apiRouter.use('/chefs', followedChefsRoutes); // Becomes /api/chefs
apiRouter.use('/recipes', recipeRoutes); // Becomes /api/recipes
apiRouter.use('/auth', authRoutes); // Becomes /api/auth
apiRouter.use('/', userRoutes); // Keep this if you have routes directly on /api (like /api/user)

app.use('/api', apiRouter);

// Catch-all for undefined API routes
apiRouter.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

// Error handler (must be after all routes)
app.use(errorHandler);

// Test Supabase connection on startup
testConnection();

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} successfully`);
});