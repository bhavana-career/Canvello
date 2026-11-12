import request from 'supertest';
import { createApp } from '@/app';
import { closeDatabase } from '@/config/database';

describe('Health Check API Test', () => {
  const app = createApp();

  afterAll(() => {
    closeDatabase();
  });

  it('should return healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('database', 'connected');
  });
});
