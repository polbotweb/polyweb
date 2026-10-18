import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { contactInfo } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";

export const updateContactInfo = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    email: z
      .email("L'adresse email est invalide.")
      .max(254, "L'email ne peut pas dépasser 254 caractères.")
      .nullable()
      .optional(),
    phone: z
      .string()
      .trim()
      .max(30, "Le numéro de téléphone ne peut pas dépasser 30 caractères.")
      .nullable()
      .optional(),
    address: z
      .string()
      .trim()
      .max(300, "L'adresse ne peut pas dépasser 300 caractères.")
      .nullable()
      .optional(),
    city: z
      .string()
      .trim()
      .max(100, "La ville ne peut pas dépasser 100 caractères.")
      .nullable()
      .optional(),
    postalCode: z
      .string()
      .trim()
      .max(20, "Le code postal ne peut pas dépasser 20 caractères.")
      .nullable()
      .optional(),
    country: z
      .string()
      .trim()
      .max(100, "Le pays ne peut pas dépasser 100 caractères.")
      .nullable()
      .optional(),
    mapUrl: z
      .url("L'URL de la carte est invalide.")
      .max(1000, "L'URL de la carte ne peut pas dépasser 1000 caractères.")
      .refine((v) => /^https?:\/\//.test(v), "L'URL doit utiliser http ou https.")
      .nullable()
      .optional(),
    latitude: z
      .string()
      .regex(/^-?(?:90(?:\.0{1,8})?|[0-8]?\d(?:\.\d{1,8})?)$/, "La latitude doit être au format décimal (ex: 48.8566).")
      .refine((v) => { const n = parseFloat(v); return n >= -90 && n <= 90; }, "La latitude doit être entre -90 et 90.")
      .nullable()
      .optional(),
    longitude: z
      .string()
      .regex(/^-?(?:180(?:\.0{1,8})?|1[0-7]\d(?:\.\d{1,8})?|\d{1,2}(?:\.\d{1,8})?)$/, "La longitude doit être au format décimal (ex: 2.3522).")
      .refine((v) => { const n = parseFloat(v); return n >= -180 && n <= 180; }, "La longitude doit être entre -180 et 180.")
      .nullable()
      .optional(),
  }).superRefine((data, ctx) => {
    const hasLat = data.latitude !== null && data.latitude !== undefined;
    const hasLon = data.longitude !== null && data.longitude !== undefined;
    if (hasLat !== hasLon) {
      ctx.addIssue({
        code: "custom",
        message: "La latitude et la longitude doivent être fournies ensemble ou toutes les deux nulles.",
        path: [hasLat ? 'longitude' : 'latitude'],
      });
    }
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "contact");

    const { id, ...data } = input;
    const db = getDrizzle();
    const [updated] = await db
      .update(contactInfo)
      .set(data)
      .where(eq(contactInfo.id, id))
      .returning();

    if (!updated) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Informations de contact introuvables.",
      });
    }

    auditAdmin(context, user.id, "CONTACT_INFO_UPDATE", {
      resource: "contact_info",
      resourceId: id,
      metadata: { email: updated.email, phone: updated.phone, city: updated.city },
    });

    invalidateCache("site:contact");
    return updated;
  },
});
