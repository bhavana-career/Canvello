import request from 'supertest';
import { createApp } from '@/app';
import { closeDatabase } from '@/config/database';

describe('Item API Integration Tests', () => {
  const app = createApp();
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'itemowner@example.com',
        password: 'password123',
        name: 'Item Owner',
      });
    authToken = res.body.token;
  });

  afterAll(() => {
    closeDatabase();
  });

  it('should create an item when authenticated', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Mechanical Keyboard',
        description: 'Custom keycaps and switches',
        price: 150.0,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Mechanical Keyboard');
  });

  it('should list items publicly', async () => {
    const res = await request(app).get('/api/items');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
