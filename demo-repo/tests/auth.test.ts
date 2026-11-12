import request from 'supertest';
import { createApp } from '@/app';
import { closeDatabase } from '@/config/database';

describe('Auth API Integration Tests', () => {
  const app = createApp();

  afterAll(() => {
    closeDatabase();
  });

  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', 'test@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('should fail registration with invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should login an existing user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});
