export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6;
}

export function validateRequired(value: any): boolean {
  return value !== undefined && value !== null && value !== '';
}
