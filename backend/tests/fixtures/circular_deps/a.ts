import { bFunction } from './b';

export function aFunction(): string {
  return 'A' + bFunction();
}
