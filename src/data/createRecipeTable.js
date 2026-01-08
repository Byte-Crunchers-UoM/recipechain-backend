import pool from '../config/db.js';

const createRecipeTable = async () => {
    const queryText = `
        CREATE TABLE IF NOT EXISTS recipes (
            id BIGSERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            ingredients JSONB,
            instructions TEXT,
            user_id BIGINT REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `;
    try {
        await pool.query(queryText);
        console.log('Recipe table created or already exists.');
    } catch (err) {
        console.error('Error creating recipe table:', err);
    }
};

export default createRecipeTable;
