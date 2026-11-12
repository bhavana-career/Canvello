import request from 'supertest';
import { createApp } from '@/app';
import { closeDatabase } from '@/config/database';

describe('User API Integration Tests', () => {
  const app = createApp();
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'userprofile@example.com',
        password: 'password123',
        name: 'Profile User',
      });
    authToken = res.body.token;
  });

  afterAll(() => {
    closeDatabase();
  });

  it('should fetch user profile when authenticated', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('email', 'userprofile@example.com');
  });

  it('should reject unauthenticated profile requests', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });
});
