import { describe, expect, it } from "vitest";
import { servicesModule } from "@/modules/services/module";
import { blogModule } from "@/modules/blog/module";
import { serviceAdminResource } from "@/modules/services/admin";
import { assertResourceCompatibility } from "@/core/admin/resource-contract";
import { assertAcyclicParent } from "@/core/taxonomy";
import { canTransitionService, assertValidServiceTransition, assertServiceRevisionRestore } from "@/modules/services/workflow";
import { calculateServiceSeoScore, serviceFormSchema, serviceAvailabilitySchema, serviceListFiltersSchema, serviceAdminFiltersSchema } from "@/modules/services/validation";
import { servicesSearchDefinition } from "@/modules/services/search";
import { formatServiceDuration, formatServicePrice, formatServiceRating, buildServiceUrl, buildServiceCategoryUrl } from "@/modules/services/utils";
import { getServiceFormTranslations } from "@/modules/services/i18n/form";
import { getServiceNotificationTranslations } from "@/modules/services/i18n/notifications";

describe("Services module contract", () => {
  it("declares the expected CMS capabilities and presentation grammar", () => {
    expect(servicesModule.id).toBe("services"); expect(servicesModule.entity).toBe("service");
    expect(servicesModule.capabilities.content).toBe(true); expect(servicesModule.capabilities.localization).toBe(true); expect(servicesModule.capabilities.media).toBe(true); expect(servicesModule.capabilities.seo).toBe(true); expect(servicesModule.capabilities.taxonomy).toBe(true); expect(servicesModule.capabilities.attributes).toBe(true); expect(servicesModule.capabilities.search).toBe(true); expect(servicesModule.capabilities.revisions).toBe(true); expect(servicesModule.capabilities.locks).toBe(true); expect(servicesModule.capabilities.engagement).toBe(true); expect(servicesModule.capabilities.moderation).toBe(true); expect(servicesModule.capabilities.notifications).toBe(true);
    expect(servicesModule.presentations.card).toEqual(expect.arrayContaining(["default", "compact", "featured"])); expect(servicesModule.presentations.list).toEqual(expect.arrayContaining(["default", "dense", "search"])); expect(servicesModule.presentations.single).toEqual(expect.arrayContaining(["default", "detail"])); expect(servicesModule.presentations.ui).toEqual(expect.arrayContaining(["price", "rating", "availability", "provider"]));
  });
  it("keeps attribute support explicit per module", () => { expect(blogModule.capabilities.attributes).toBe(false); expect(servicesModule.capabilities.attributes).toBe(true); });
  it("exposes a real admin resource contract compatible with the module", () => { expect(serviceAdminResource.id).toBe("service"); expect(serviceAdminResource.actions).toEqual(expect.objectContaining({ create: true, read: true, update: true, duplicate: true, publish: true, unpublish: true, archive: true, restore: true, delete: true })); expect(serviceAdminResource.list?.filters?.map((filter) => filter.queryParam)).toEqual(expect.arrayContaining(["search", "status", "categoryId", "tagId", "providerId", "featured", "mobile", "locale"])); expect(() => assertResourceCompatibility(servicesModule, serviceAdminResource)).not.toThrow(); });
});

describe("Services workflow", () => {
  it("accepts every legal transition and rejects illegal ones", () => { const legal = [["DRAFT","PUBLISHED"],["DRAFT","ARCHIVED"],["DRAFT","DELETED"],["PUBLISHED","DRAFT"],["PUBLISHED","ARCHIVED"],["PUBLISHED","DELETED"],["ARCHIVED","DRAFT"],["ARCHIVED","DELETED"],["DELETED","DRAFT"]] as const; for (const [from,to] of legal) expect(canTransitionService(from,to)).toBe(true); const illegal = [["DRAFT","DRAFT"],["PUBLISHED","PUBLISHED"],["ARCHIVED","PUBLISHED"],["DELETED","PUBLISHED"]] as const; for (const [from,to] of illegal) expect(canTransitionService(from,to)).toBe(false); expect(() => assertValidServiceTransition("DELETED","PUBLISHED")).toThrow(); });
  it("does not allow a revision restore to bypass the lifecycle", () => { expect(() => assertServiceRevisionRestore("DELETED","PUBLISHED")).toThrow(); expect(() => assertServiceRevisionRestore("ARCHIVED","PUBLISHED")).toThrow(); expect(() => assertServiceRevisionRestore("PUBLISHED","DRAFT")).not.toThrow(); });
});

describe("Services taxonomy", () => { it("rejects self-parenting and ancestor cycles", () => { const nodes = [{ id:"a", parentId:null },{ id:"b", parentId:"a" },{ id:"c", parentId:"b" }]; expect(() => assertAcyclicParent(nodes,"a","a")).toThrow(); expect(() => assertAcyclicParent(nodes,"a","c")).toThrow(); expect(() => assertAcyclicParent(nodes,"c","a")).not.toThrow(); }); });

describe("Services validation", () => {
  const valid = { organizationId:null, locale:"fr", title:"Développement de site web", slug:"developpement-site-web", excerpt:"Création de sites web sur mesure.", content:"<p>Création de sites web sur mesure.</p>", status:"DRAFT" as const, publishedAt:null, coverImageId:null, ogImageId:null, priceMinor:12500, currency:"EUR", durationMinutes:90, maxParticipants:4, isMobile:false, isFeatured:false, categoryIds:[], tagIds:[], metaTitle:"Développement de site web", metaDescription:"Création de sites web sur mesure.", locationLabel:null, locationAddress:null, focusKeyword:"site web" };
  it("accepts valid localized service input", () => { const parsed = serviceFormSchema.parse(valid); expect(parsed.locale).toBe("fr"); expect(parsed.status).toBe("DRAFT"); expect(parsed.publishedAt).toBeNull(); });
  it("rejects publication state through create input", () => { expect(serviceFormSchema.safeParse({...valid,status:"PUBLISHED",publishedAt:new Date()}).success).toBe(false); });
  it("rejects unsupported locale, negative price and malformed slug", () => { expect(serviceFormSchema.safeParse({...valid,locale:"de"}).success).toBe(false); expect(serviceFormSchema.safeParse({...valid,priceMinor:-1}).success).toBe(false); expect(serviceFormSchema.safeParse({...valid,slug:"Invalid Slug"}).success).toBe(false); });
  it("validates availability intervals", () => { expect(serviceAvailabilitySchema.safeParse({serviceId:crypto.randomUUID(),dayOfWeek:1,startTime:"09:00",endTime:"18:00",timezone:"Europe/Paris"}).success).toBe(true); expect(serviceAvailabilitySchema.safeParse({serviceId:crypto.randomUUID(),dayOfWeek:1,startTime:"18:00",endTime:"09:00",timezone:"Europe/Paris"}).success).toBe(false); });
  it("keeps admin filtering separate from public filtering", () => { const parsed = serviceAdminFiltersSchema.parse({page:2,limit:50,status:"PUBLISHED",categoryId:crypto.randomUUID(),tagId:crypto.randomUUID(),authorId:"provider",featured:true,mobile:false,locale:"ar",sortBy:"ratingAverage100",sortOrder:"asc"}); expect(parsed.page).toBe(2); expect(parsed.authorId).toBe("provider"); expect(parsed.locale).toBe("ar"); expect(() => serviceAdminFiltersSchema.parse({limit:101})).toThrow(); expect(() => serviceListFiltersSchema.parse({limit:101})).toThrow(); });
  it("calculates a bounded SEO score", () => { expect(calculateServiceSeoScore({title:"Titre",metaTitle:"Meta",metaDescription:"Description",focusKeyword:"clé"})).toBeGreaterThan(0); expect(calculateServiceSeoScore({title:"x".repeat(100),metaTitle:"y".repeat(100),metaDescription:"z".repeat(120),focusKeyword:"clé"})).toBe(100); });
});

describe("Services localization", () => { it("provides complete form and notification translations in all supported locales", () => { for (const locale of ["fr","en","es","ar"] as const) { const form = getServiceFormTranslations(locale); const notifications = getServiceNotificationTranslations(locale); expect(form.actions.regenerateSlug).toBeTruthy(); expect(form.actions.publish).toBeTruthy(); expect(form.sections.availability).toBeTruthy(); expect(notifications.publishedTitle).toBeTruthy(); expect(notifications.reviewApprovedMessage).toBeTruthy(); } }); });

describe("Services search contract", () => { it("declares searchable, filterable and sortable service fields", () => { expect(servicesSearchDefinition.fields.find((f) => f.name === "title")?.searchable).toBe(true); expect(servicesSearchDefinition.fields.find((f) => f.name === "status")?.filterable).toBe(true); expect(servicesSearchDefinition.fields.find((f) => f.name === "priceMinor")?.sortable).toBe(true); }); });

describe("Services URL contract", () => { it("uses organization slugs rather than ids", () => { expect(buildServiceUrl("fr",null,"audit-service","pro")).toBe("/fr/services/category/pro/audit-service"); expect(buildServiceUrl("fr","acme","audit-service","pro")).toBe("/fr/acme/services/category/pro/audit-service"); expect(buildServiceCategoryUrl("ar","acme","pro")).toBe("/ar/acme/services/category/pro"); }); });

describe("Services utilities", () => { it("formats duration, rating and price deterministically", () => { expect(formatServiceDuration(45)).toBe("45 min"); expect(formatServiceDuration(90)).toBe("1 h 30 min"); expect(formatServiceRating(450)).toBe(4.5); expect(formatServicePrice(1250,"EUR","fr-FR")).toContain("12,50"); }); });
