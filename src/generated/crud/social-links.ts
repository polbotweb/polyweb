// Généré par `pnpm api:generate socialLinks` — relancer le générateur plutôt que d'éditer.
import { socialLinks } from "@database/schemas";
import type { CrudRegistration } from "@/core/crud/engine";

export const socialLinksCrud: CrudRegistration = {
  table: socialLinks,
  definition: {
    "id": "social-links",
    "exportName": "socialLinks",
    "tableName": "social_links",
    "primaryKey": "id",
    "columns": [
      {
        "key": "id",
        "name": "id",
        "type": "string",
        "notNull": true,
        "hasDefault": true,
        "isPrimary": true,
        "writable": false
      },
      {
        "key": "platform",
        "name": "platform",
        "type": "string",
        "notNull": true,
        "hasDefault": false,
        "isPrimary": false,
        "writable": true
      },
      {
        "key": "url",
        "name": "url",
        "type": "string",
        "notNull": true,
        "hasDefault": false,
        "isPrimary": false,
        "writable": true
      },
      {
        "key": "icon",
        "name": "icon",
        "type": "string",
        "notNull": false,
        "hasDefault": false,
        "isPrimary": false,
        "writable": true
      },
      {
        "key": "label",
        "name": "label",
        "type": "string",
        "notNull": false,
        "hasDefault": false,
        "isPrimary": false,
        "writable": true
      },
      {
        "key": "sortOrder",
        "name": "sort_order",
        "type": "number",
        "notNull": true,
        "hasDefault": true,
        "isPrimary": false,
        "writable": true
      },
      {
        "key": "isActive",
        "name": "is_active",
        "type": "boolean",
        "notNull": true,
        "hasDefault": true,
        "isPrimary": false,
        "writable": true
      },
      {
        "key": "createdAt",
        "name": "created_at",
        "type": "date",
        "notNull": true,
        "hasDefault": true,
        "isPrimary": false,
        "writable": false
      },
      {
        "key": "updatedAt",
        "name": "updated_at",
        "type": "date",
        "notNull": true,
        "hasDefault": true,
        "isPrimary": false,
        "writable": false
      }
    ],
    "access": {
      "list": "public",
      "read": "public",
      "create": "permission:site:update",
      "update": "permission:site:update",
      "delete": "permission:site:update"
    },
    "sortable": [
      "id",
      "platform",
      "url",
      "icon",
      "label",
      "sortOrder",
      "isActive",
      "createdAt",
      "updatedAt"
    ],
    "filterable": [
      "id",
      "platform",
      "url",
      "icon",
      "label",
      "sortOrder",
      "isActive"
    ]
  },
};
