import { supabase, supabaseAdmin } from '../config/supabase.js';
export const logActivity = async (title, description, type) => {
    console.log("DEBUG: logActivity called with:", { title, description, type });
    
    try {
        // Ensure you are using supabaseAdmin here!
        const { data, error } = await supabaseAdmin
            .from('activities')
            .insert([{ title, description, activity_type: type }]);
        
        if (error) {
            console.error("❌ CRITICAL SUPABASE INSERT ERROR:", error);
        } else {
            console.log("✅ Row inserted successfully! Data:", data);
        }
    } catch (err) {
        console.error("❌ CATCH BLOCK ERROR:", err);
    }
};