import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { blogPublicRateLimit } from "./_helpers";
import { extractIp } from "@/lib/audit";
import { LOCALES } from "@i18n/config";
import {
  blogNewsletterService,
  NewsletterConfigurationError,
  NewsletterDeliveryError,
  NewsletterOrganizationNotFoundError,
} from "@/lib/newsletter/blog-newsletter-service";

const blogSubscriptionSchema = z.object({
  email: z.email("Email invalide").trim().toLowerCase(),
  locale: z.enum(LOCALES),
  organizationId: z.string().trim().min(1).optional().nullable(),
});

const blogTokenSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

function auditContext(context: {
  request: Request;
  clientAddress?: string;
}) {
  return {
    ipAddress: extractIp(context.request.headers, context.clientAddress),
    userAgent: context.request.headers.get("user-agent"),
  };
}

export const subscribeBlogNewsletter = defineAction({
  input: blogSubscriptionSchema,
  handler: async (input, context) => {
    blogPublicRateLimit(context, "newsletter-subscribe", { window: 3600, max: 10 });

    try {
      await blogNewsletterService.subscribe({
        email: input.email,
        locale: input.locale,
        organizationId: input.organizationId ?? null,
        configuredSite: context.site,
        audit: auditContext(context),
      });
    } catch (error) {
      if (error instanceof NewsletterOrganizationNotFoundError) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Organisation invalide.",
        });
      }
      if (
        error instanceof NewsletterConfigurationError ||
        error instanceof NewsletterDeliveryError
      ) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "L'inscription n'a pas pu être finalisée. Veuillez réessayer.",
        });
      }
      throw error;
    }

    return { success: true };
  },
});

export const confirmBlogSubscription = defineAction({
  input: blogTokenSchema,
  handler: async (input, context) => {
    blogPublicRateLimit(context, "newsletter-confirm", { window: 3600, max: 20 });
    await blogNewsletterService.confirm({
      token: input.token,
      audit: auditContext(context),
    });

    // Deliberately state-independent for the public Action API.
    return { success: true };
  },
});

export const unsubscribeBlogNewsletter = defineAction({
  input: blogTokenSchema,
  handler: async (input, context) => {
    blogPublicRateLimit(context, "newsletter-unsubscribe", { window: 3600, max: 20 });
    await blogNewsletterService.unsubscribe({
      token: input.token,
      audit: auditContext(context),
    });

    // Deliberately state-independent for the public Action API.
    return { success: true };
  },
});

export { blogSubscriptionSchema };
