import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { testConnection } from "./config/supabase.js";
import userRoutes from "./routes/userRoutes.js";
import recipeRoutes from "./routes/recipeRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ✅ allow cookies
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ message: "RecipeChain API", version: "1.0.0", status: "running" });
});

// Test DB
app.get("/test-db", async (req, res) => {
  try {
    const ok = await testConnection();
    res.json({ success: ok, message: ok ? "Supabase OK" : "Supabase failed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Routes
app.use("/api", userRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/auth", authRoutes);

// Error handler
app.use(errorHandler);

testConnection();

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));