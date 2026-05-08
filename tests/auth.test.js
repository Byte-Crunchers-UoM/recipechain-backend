// tests/auth.test.js
import request from 'supertest';
import app from '../src/index.js';
describe('Admin Authentication API', () => {
  
  // Test Scenario 1: The Happy Path (Successful Login)
  it('should successfully log in a valid admin and return a token', async () => {
    const res = await request(app).post('/api/auth/admin-login').send({
        email: 'admin@recipechain.com', // Your test email
        password: '20010319'        // Your test password
      });

    // Assertions (What we expect the server to say)
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Admin Login successful!');
    
    // Check if the token and user data are attached
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('admin');
  });

  // Test Scenario 2: Wrong Password
  it('should return 401 Unauthorized for incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({
        email: 'admin@recipechain.com',
        password: 'WrongPassword123'
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Email or Password wrong');
  });

  // Test Scenario 3: Missing Fields (Bad Request)
  it('should handle missing email or password gracefully', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({
        email: 'admin@recipechain.com'
        // Intentionally leaving out password
      });

    // Depending on your validation, this might be a 400 or 401
    // Adjust the expected status code based on how your backend handles it
    expect(res.statusCode).toBeGreaterThanOrEqual(400); 
  });
});