import pool from '../config/db.js'; 

const createUserTable = async () => {
    const queryText = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    try {
        await pool.query(queryText);
        console.log('User table created or already exists.');
    } catch (err) {
        console.error('Error creating user table:', err);
    }
};

export default createUserTable;