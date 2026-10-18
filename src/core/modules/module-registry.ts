import type { PolywebModuleDefinition } from "./module-contract";

const modules = new Map<string, PolywebModuleDefinition>();

export function registerModule(module: PolywebModuleDefinition): void {
  if (modules.has(module.id)) throw new Error(`Polyweb module already registered: ${module.id}`);
  modules.set(module.id, module);
}

export function getModule(id: string): PolywebModuleDefinition | undefined {
  return modules.get(id);
}

export function listModules(): readonly PolywebModuleDefinition[] {
  return [...modules.values()];
}

export function clearModuleRegistryForTests(): void {
  modules.clear();
}
