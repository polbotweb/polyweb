import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { openingHours } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";

/** HH:MM field with range validation (00-23 : 00-59) */
const timeField = (label: string) =>
  z
    .string()
    .regex(/^\d{2}:\d{2}$/, `${label} doit être au format HH:MM.`)
    .refine((v) => {
      const [h, m] = v.split(':').map(Number);
      return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    }, `${label} : heure invalide (HH: 00-23, MM: 00-59).`)
    .nullable()
    .optional();

const hourItemSchema = z.object({
  id: z.string().min(1, "L'identifiant est requis."),
  openTime: timeField("L'heure d'ouverture"),
  closeTime: timeField("L'heure de fermeture"),
  hasMiddayBreak: z.boolean().optional(),
  morningOpen: timeField("L'heure du matin (ouverture)"),
  morningClose: timeField("L'heure du matin (fermeture)"),
  afternoonOpen: timeField("L'heure de l'après-midi (ouverture)"),
  afternoonClose: timeField("L'heure de l'après-midi (fermeture)"),
  isClosed: z.boolean().optional(),
}).refine(
  (d) => d.isClosed || (!!d.openTime && !!d.closeTime),
  { message: "L'heure d'ouverture et de fermeture sont obligatoires quand l'établissement n'est pas fermé.", path: ["openTime"] },
).refine(
  (d) => d.isClosed || !d.openTime || !d.closeTime || d.openTime < d.closeTime,
  { message: "L'heure de fermeture doit être postérieure à l'heure d'ouverture.", path: ["closeTime"] },
).refine(
  (d) => !d.hasMiddayBreak || (!!d.morningOpen && !!d.morningClose && !!d.afternoonOpen && !!d.afternoonClose),
  { message: "Les 4 horaires de coupure midi sont obligatoires quand la pause méridienne est activée.", path: ["morningOpen"] },
).refine(
  (d) => !d.hasMiddayBreak || !d.morningClose || !d.afternoonOpen || d.morningClose < d.afternoonOpen,
  { message: "L'ouverture de l'après-midi doit être postérieure à la fermeture du matin.", path: ["afternoonOpen"] },
);

export const updateOpeningHours = defineAction({
  input: z.object({
    items: z
      .array(hourItemSchema)
      .min(1, "Au moins un horaire est requis.")
      .max(7, "Maximum 7 jours de la semaine."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "hours");

    const db = getDrizzle();

    const updated = await db.transaction(async (tx) => {
      const rows: Array<typeof openingHours.$inferSelect> = [];

      for (const item of input.items) {
        const { id, ...data } = item;
        const [row] = await tx
          .update(openingHours)
          .set(data)
          .where(eq(openingHours.id, id))
          .returning();

        if (!row) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: `Horaire introuvable (id: ${id}).`,
          });
        }
        rows.push(row);
      }

      return rows;
    });

    auditAdmin(context, user.id, "OPENING_HOURS_UPDATE", {
      resource: "opening_hours",
      metadata: { count: updated.length },
    });

    invalidateCache("site:hours");
    return updated;
  },
});
