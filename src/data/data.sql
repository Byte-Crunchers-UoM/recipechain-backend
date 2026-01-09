-- Database Schema Reference
-- Run this in Supabase SQL Editor to create the users table

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable RLS for testing (enable in production with proper policies)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

