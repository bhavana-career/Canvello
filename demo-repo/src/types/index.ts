export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface Item {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  price: number;
  createdAt: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user';
}
