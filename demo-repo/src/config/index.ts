export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'demo-jwt-secret-key-12345',
  jwtExpiresIn: '24h',
  dbPath: process.env.DB_PATH || ':memory:',
};
