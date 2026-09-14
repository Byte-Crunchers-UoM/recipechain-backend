import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
}

if (!supabaseServiceRoleKey) {
  console.warn("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const testConnection = async () => {
  try {
    const { error } = await supabase.auth.getSession();
    if (error) throw error;

    console.log("Supabase connected successfully");
    return true;
  } catch (error) {
    console.error("Supabase connection error:", error.message);
    console.log("Tip: Check your SUPABASE_URL and SUPABASE_ANON_KEY in .env file");
    return false;
  }
};