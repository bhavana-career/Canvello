import { ghostFunction } from './missing_module';
import { fakeExport } from 'non-existent-npm-package-xyz';

export function run() {
  return ghostFunction() + fakeExport;
}
