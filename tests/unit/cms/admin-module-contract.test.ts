import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("blog and services admin editor contracts", () => {
  it("loads blog edit capabilities before rendering lifecycle controls", () => {
    const route = read("src/pages/[lang]/admin/blog/[id]/edit.astro");
    const form = read("src/components/blog/AdminPostForm.astro");

    expect(route).toContain("hasBlogPermission");
    expect(route).toContain("canCreate");
    expect(route).toContain("canPublish");
    expect(route).toContain("canDelete");
    expect(route).toContain("canUpdate={true}");
    expect(form).toContain("canPublish && post.status === \"DRAFT\"");
    expect(form).toContain("canDelete && post.status !== \"DELETED\"");
    expect(form).toContain("canCreate && <Button");
  });

  it("keeps service editor navigation and lifecycle authorization explicit", () => {
    const route = read("src/pages/[lang]/admin/services/[id]/edit.astro");
    const form = read("src/components/services/AdminServiceForm.astro");

    expect(route).toContain("baseAdminUrl={`/${locale}/admin/services`}");
    expect(route).toContain("canUpdate={canUpdate}");
    expect(route).toContain("canPublish={canPublish}");
    expect(route).toContain("canDelete={canDelete}");
    expect(form).toContain("data-base-admin-url={baseAdminUrl}");
    expect(form).toContain("try { result = serviceId ? await actions.updateService");
    expect(form).toContain("errorText(result)");
  });

  it("does not rely on native form submission for admin mutations", () => {
    const blogForm = read("src/components/blog/AdminPostForm.astro");
    const serviceForm = read("src/components/services/AdminServiceForm.astro");

    expect(blogForm).toContain('event.preventDefault()');
    expect(serviceForm).toContain('event.preventDefault()');
    expect(blogForm).toContain("actions.updateBlogPost");
    expect(serviceForm).toContain("actions.updateService");
  });
});
