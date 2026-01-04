import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import pool from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import createUserTable from './data/createUserTable.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

//routes
app.use('/api', userRoutes); 

//testing postgres connection
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT current_database()');
    res.send(`Connected to database: ${result.rows[0].current_database}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error connecting to the database');
  }
});

//error handler (must be after all routes)
app.use(errorHandler);

//create tables before starting the server
createUserTable();

//server running
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});