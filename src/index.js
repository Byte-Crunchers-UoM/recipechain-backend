// src/index.js

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { testConnection } from "./config/supabase.js";

import userRoutes from "./routes/userRoutes.js";
import buyerRoutes from "./routes/buyerRoutes.js";
import recipeRoutes from "./routes/recipeRoutes.js";
import savedRecipeRoutes from "./routes/savedRecipeRoutes.js";
import sellerRoutes from "./routes/sellerRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import stripeRoutes from "./routes/stripeRoutes.js";

import errorHandler from "./middleware/errorHandler.js";

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
app.use("/api", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/buyer", buyerRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/savedrecipes", savedRecipeRoutes);
app.use("/api/wallet", walletRoutes);

// Error handler
app.use(errorHandler);

// Start server only after checking Supabase connection
const startServer = async () => {
  try {
    await testConnection();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(
        `Frontend origin: ${process.env.FRONTEND_URL || "http://localhost:3000"}`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();