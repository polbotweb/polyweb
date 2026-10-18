export { default as AdminResourceShell } from "@organisms/AdminResourceShell.astro";
export { default as AdminFormShell } from "@organisms/AdminFormShell.astro";
export { default as AdminResourceStats } from "@molecules/AdminResourceStats.astro";
export { default as DataView } from "@molecules/DataView/DataView.astro";
export type { AdminResourceDefinition, ResourceManagementCapabilities, ResourceActionCapabilities, ResourcePresentationVariants } from "./resource-contract";
export { assertResourceCompatibility } from "./resource-contract";
export * from "@/core/admin/filter-contract";
