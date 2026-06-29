// src/index.js

import dotenv from "dotenv";
dotenv.config();

import express from 'express';
import cors from 'cors';
import { testConnection } from './config/supabase.js';
import userRoutes from './routes/userRoutes.js';
import buyerRoutes from './routes/buyerRoutes.js';
import sellerRoutes from './routes/sellerRoutes.js';
import recipeRoutes from './routes/recipeRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import cookieParser from "cookie-parser";
import savedRecipeRoutes from "./routes/savedRecipeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";
import aiRoutes from './routes/aiRoutes.js';
import adminReviewRoutes from "./routes/adminReviewRoutes.js";
import { protectAdmin } from "./middleware/authMiddleware.js";



const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(cookieParser());

/**
 * Stripe webhook route must come BEFORE express.json().
 * This is important because Stripe webhook signature verification usually
 * requires the raw request body.
 */
app.use("/api/stripe", stripeRoutes);

// Normal body parsers for the rest of the app
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "RecipeChain API",
    version: "1.0.0",
    status: "running",
  });
});

// Test DB
app.get("/test-db", async (req, res) => {
  try {
    const ok = await testConnection();

    res.json({
      success: ok,
      message: ok ? "Supabase OK" : "Supabase failed",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// API routes
app.use('/api', userRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/buyers', buyerRoutes);
app.use('/api/sellers', sellerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use("/api/savedrecipes", savedRecipeRoutes);
app.use("/api/wallet", walletRoutes);
app.use('/api/ai', aiRoutes);
app.use("/api/admin/reviews", protectAdmin, adminReviewRoutes);


// Error handler
app.use(errorHandler);

// Start server only after checking Supabase connection
const startServer = async () => {
  try {
    await testConnection();
    // Start server
    const environment = process.env.NODE_ENV || 'development';

    if (environment.trim() !== 'test') {
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} successfully`);
      });
    }
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Invoke start
startServer();

export default app;
