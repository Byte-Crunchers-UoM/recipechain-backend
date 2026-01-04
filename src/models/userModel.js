import pool from '../config/db.js';

// Data access layer - pure database operations

export const createUserModel = async (username, email) => {
  const result = await pool.query(
    'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
    [username, email]
  );
  return result.rows[0];
};

export const getUserByIdModel = async (id) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
};

export const getUserByEmailModel = async (email) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
};

export const getAllUsersModel = async () => {
  const result = await pool.query('SELECT * FROM users');
  return result.rows;
};

export const updateUserModel = async (id, username, email) => {
  const result = await pool.query(
    'UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING *',
    [username, email, id]
  );
  return result.rows[0];
};

export const deleteUserModel = async (id) => {
  const result = await pool.query(
    'DELETE FROM users WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0];
};
