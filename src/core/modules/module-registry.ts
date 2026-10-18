import type { AtomicModuleDefinition } from "./module-contract";

const modules = new Map<string, AtomicModuleDefinition>();

export function registerModule(module: AtomicModuleDefinition): void {
  if (modules.has(module.id)) throw new Error(`Atomic module already registered: ${module.id}`);
  modules.set(module.id, module);
}

export function getModule(id: string): AtomicModuleDefinition | undefined {
  return modules.get(id);
}

export function listModules(): readonly AtomicModuleDefinition[] {
  return [...modules.values()];
}

export function clearModuleRegistryForTests(): void {
  modules.clear();
}
