import { describe, it, expect } from "vitest";
import baseline from "./fixtures/permissions-baseline.json";
import * as P from "@/lib/permissions";
import { MODULE_PERMISSIONS } from "@/modules/permissions";
import { defineModulePermissions, mergeStatements, moduleGrants } from "@/core/permissions/registry";

const norm = (o: Record<string, readonly string[]>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v.length > 0).map(([k, v]) => [k, [...v].sort()]).sort(([a], [b]) => String(a).localeCompare(String(b))));

describe("registre des permissions par module", () => {
  it("rétrocompatible : statements et rôles prédéfinis identiques à la référence d'avant le registre", () => {
    expect(norm(P.statement)).toEqual(norm(baseline.statement as Record<string, string[]>));
    for (const k of ["adminRole", "editorRole", "userRole", "orgOwnerRole", "orgAdminRole", "orgMemberRole"] as const) {
      expect(norm(P[k].statements as Record<string, readonly string[]>), k).toEqual(norm((baseline as Record<string, unknown>)[k] as Record<string, string[]>));
    }
  });

  it("chaque module déclare au moins un namespace, sans doublon", () => {
    const seen = new Set<string>();
    for (const m of MODULE_PERMISSIONS) {
      expect(Object.keys(m.statements).length, m.module).toBeGreaterThan(0);
      for (const ns of Object.keys(m.statements)) {
        expect(seen.has(ns), ns).toBe(false);
        seen.add(ns);
      }
    }
  });

  it("refuse un namespace en double ou une action accordée non déclarée", () => {
    const a = defineModulePermissions({ module: "a", label: "A", statements: { x: ["read"] }, grants: {} });
    expect(() => mergeStatements({ x: ["read"] }, [a])).toThrow(/deux fois/);
    const bad = { module: "b", label: "B", statements: { y: ["read"] }, grants: { admin: { y: ["delete"] } } } as never;
    expect(() => moduleGrants([bad], "admin")).toThrow(/non déclaré/);
    const undeclared = { module: "c", label: "C", statements: { y: ["read"] }, grants: { admin: { z: ["read"] } } } as never;
    expect(() => moduleGrants([undeclared], "admin")).toThrow(/sans le déclarer/);
  });
});
