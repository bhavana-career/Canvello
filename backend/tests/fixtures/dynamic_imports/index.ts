export async function loadModule(name: string) {
  const mod = await import(`./plugins/${name}`);
  return mod.default();
}

export function loadLegacy(pkg: string) {
  return require(pkg);
}
