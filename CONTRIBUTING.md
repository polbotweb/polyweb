# Contributing to Atomic

## Overview

**Atomic** is a full-stack SSR web application with complete authentication, organization management, audit trails, and accessibility compliance. We welcome contributions!

**Tech Stack**: Astro 6 · better-auth · Drizzle ORM · PostgreSQL 16 · Tailwind CSS 4 · Vitest · Playwright

## Prerequisites

- **Node.js** ≥ 22.12.0
- **pnpm** ≥ 10 (enable via `corepack enable`)
- **PostgreSQL** 16 (local or Docker)
- **Git** configured with SSH keys (recommended)

## Local Setup

```bash
# Clone repository
git clone git@github.com:yourusername/atomic.git
cd atomic

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env: DATABASE_URL_LOCAL, BETTER_AUTH_SECRET, SMTP config

# Setup database
pnpm db:migrate    # Apply migrations
pnpm db:seed       # Load sample data (optional)

# Start development server
pnpm dev
```

Visit `http://localhost:4321` — hot reload enabled ✓

## Development Scripts

### Daily Commands

| Command | Purpose |
| --------- | --------- |
| `pnpm dev` | Start dev server (Astro + auto-reload) |
| `pnpm check` | TypeScript check (`astro check`) |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | ESLint auto-fix |
| `pnpm test` | Vitest (unit + integration) |
| `pnpm test:watch` | Vitest watch mode |

### Database Management

| Command | Purpose |
| --------- | --------- |
| `pnpm db:check` | Verify DB connection |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:generate` | Create migration from schema changes |
| `pnpm db:seed` | Populate with sample data |
| `pnpm db:reset` | Drop & recreate all tables |
| `pnpm db:sync` | Sync schema with migrations |

### Testing & QA

| Command | Purpose |
| --------- | --------- |
| `pnpm test` | Unit + integration tests |
| `pnpm test:e2e` | Playwright E2E tests (3 browsers) |
| `pnpm test:e2e:ui` | E2E with interactive UI |
| `pnpm a11y` | Full accessibility audit (Pa11y + Lighthouse) |
| `pnpm qa` | Complete QA suite (lint + types + tests + E2E + a11y) |
| `pnpm qa:offline` | QA without network tests (faster) |

## Project Structure

### Source (`src/`)

```md
src/
├── actions/                   # Astro server actions (mutations)
│   ├── admin/                # Admin panel actions
│   └── org/                  # Organization management
├── components/               # Atomic design
│   ├── atoms/               # Basic UI (Button, Input, Card, Badge)
│   ├── molecules/           # Combinations (SearchBar, FormGroup)
│   ├── organisms/           # Complex features (MediaPicker, RoleMatrix)
│   └── pages/               # Full page components (admin, org views)
├── database/
│   ├── schemas/             # Drizzle table definitions
│   ├── loaders/             # Data fetching with caching (RTL config)
│   ├── cache.ts             # TTL-based in-memory cache
│   ├── migrations/          # Generated migration files
│   └── commands/            # CLI utilities (seed, reset, migrate)
├── i18n/
│   ├── config.ts            # Locale config (fr, en, es, ar)
│   ├── utils.ts             # i18n helpers & locale detection
│   └── {locale}/            # Per-locale translation files
│       ├── common.ts
│       ├── auth.ts
│       ├── pages.ts
│       └── ...
├── layouts/
│   └── BaseLayout.astro     # Main layout with nav, footer, theme
├── lib/
│   ├── auth.ts              # better-auth client
│   ├── auth-data.ts         # Admin user/org fetching
│   ├── auth-guards.ts       # Route protection helpers
│   ├── rate-limit.ts        # Token bucket rate limiting
│   ├── sanitize.ts          # DOMPurify wrapper (strict config)
│   └── types.ts             # Shared TypeScript types
├── media/
│   ├── upload.ts            # File upload handler
│   ├── delete.ts            # File deletion
│   ├── list.ts              # File enumeration
│   └── types.ts             # Media type definitions
├── pages/
│   ├── index.astro          # Homepage
│   ├── admin/               # Admin routes
│   ├── org/                 # Organization routes
│   └── api/                 # API endpoints
│       ├── search.ts        # Full-text search (PostgreSQL)
│       ├── contact.ts       # Contact form
│       └── ...
├── smtp/
│   ├── index.ts             # Multi-provider email service
│   ├── providers/           # Brevo, Resend, Nodemailer
│   ├── templates/           # HTML email templates
│   └── types.ts             # Email payload types
└── styles/
    ├── globals.css          # Tailwind directives + CSS variables
    └── design-tokens.css    # Color, spacing, typography
```

### Tests (`tests/`)

```md
tests/
├── unit/                    # Fast, no DB required
│   ├── admin-roles.test.ts
│   ├── media.test.ts
│   └── ...
├── integration/             # Requires PostgreSQL
│   ├── auth.test.ts
│   ├── organizations.test.ts
│   └── ...
├── e2e/                     # Playwright against running app
│   ├── auth.spec.ts
│   ├── admin.spec.ts
│   └── ...
├── a11y/                    # Accessibility audits
│   ├── pa11y-ci.cjs        # Pa11y automation
│   └── lighthouse.cjs      # Lighthouse CI
└── helpers/
    ├── test-db.ts          # Test database setup
    ├── mocks.ts            # Common test fixtures
    └── reporters.cjs       # Custom test reports
```

## Architectural Patterns

### 1. Server Actions (Mutations)

Use Astro server actions for all data mutations. They're **type-safe**, **validated**, and **CSRF-protected** by default.

**File**: `src/actions/admin/users.ts`

```typescript
import { defineAction } from 'astro:actions';
import { z } from 'zod';
import { banUser } from '@/lib/user-service';

export const ban = defineAction({
  accept: 'json',
  input: z.object({
    userId: z.string().uuid(),
    reason: z.string().optional(),
  }),
  handler: async (input, context) => {
    // ✓ Type-safe params, automatic CSRF protection
    return await banUser(input.userId, input.reason);
  },
});
```

**Usage in Components**:

```typescript
import { actions } from 'astro:actions';

const { error, data } = await actions.admin.users.ban({
  userId: '123',
  reason: 'Spam',
});
```

### 2. API Routes (External APIs, Webhooks)

Use API routes for public endpoints (search, webhooks, third-party integrations).

**File**: `src/pages/api/search.ts`

```typescript
export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q');
  // ✓ PostgreSQL full-text search with ts_rank
  const results = await db.execute(sql`...`);
  return new Response(JSON.stringify(results));
};
```

**Apply Rate Limiting** on public endpoints:

```typescript
const rl = checkRateLimit(`api_${clientAddress}`, { window: 60, max: 100 });
if (!rl.allowed) {
  return new Response('Too many requests', { status: 429 });
}
```

### 3. Database Loaders (Caching)

**Always** use loaders for data fetching. They automatically implement TTL caching.

**File**: `src/database/loaders/users.loader.ts`

```typescript
export const getUser = cached('user', async (id: string) => {
  // Cached for 5 min (configurable)
  return db.query.users.findFirst({
    where: eq(users.id, id),
  });
}, { ttl: 300 });
```

**Usage**:

```typescript
const user = await getUser(userId); // 1st call = DB, 2nd call = cache
```

### 4. i18n: Multi-Locale Architecture

**4 locales**: `fr` (default) | `en` | `es` | `ar` (RTL)

**Rule**: Every translation key **must exist in all 4 locales**. CI enforces this.

**File Structure**:

```typescript
// src/i18n/fr/auth.ts
export default {
  signIn: { title: 'Connexion', ... },
  ...
} satisfies AuthTranslations;  // ← Forces type safety
```

**In Components**:

```typescript
---
import type { Locale } from '@i18n/config';
const locale: Locale = Astro.params.locale ?? 'fr';
const { t } = await getTranslations(locale);
---

<h1>{t.signIn.title}</h1>
```

**Adding a New Key**:

1. Add key to English (`src/i18n/en/auth.ts`)
2. Copy to other locales (fr, es, ar)
3. Translate each language
4. TypeScript will error if any locale is missing the key ✓

### 5. Authentication (better-auth)

We use **better-auth** with **email/password**, **sessions**, and **organization roles**.

**Session in Components**:

```typescript
import { auth } from '@/lib/auth';

const session = await auth.api.getSession({ headers });
if (!session) return new Response('Unauthorized', { status: 401 });

console.log(session.user); // { id, email, role, ... }
```

**Protect Routes**:

```typescript
// src/lib/auth-guards.ts
export async function requireAuth(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('Not authenticated');
  return session;
}

// src/pages/admin.astro
const session = await requireAuth(Astro.request.headers);
```

### 6. Form Validation (Zod)

**Always** validate inputs with Zod before processing.

```typescript
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  message: z.string().min(10).max(5000),
});

const parsed = contactSchema.safeParse(body);
if (!parsed.success) {
  return Response.json(
    { error: 'VALIDATION_ERROR', details: z.flattenError(parsed.error).fieldErrors },
    { status: 400 }
  );
}
```

### 7. HTML Sanitization

**Never** render user-generated HTML without sanitizing.

```typescript
import { sanitize } from '@/lib/sanitize';

// Strict allowlist: no scripts, no data-* attrs, no event handlers
const safe = sanitize(userContent);  // <p>Hello</p> → ✓, <script> → ✗
```

## Code Style & Quality

### Linting & Types

```bash
# Before every commit:
pnpm lint       # ESLint
pnpm check      # astro check (TypeScript strict)
pnpm test       # Unit + integration tests
```

**ESLint Rules**:

- Flat config (`eslint.config.js`)
- No `any` without `// @ts-expect-error`
- No unused variables (caught by TypeScript)
- 2-space indentation

### Naming Conventions

| Pattern | Example | Location |
| --------- | --------- | ---------- |
| **PascalCase** | `UserCard.astro`, `MediaPicker.astro` | Components |
| **camelCase** | `getUser()`, `formatDate()` | Functions, variables |
| **UPPER_SNAKE** | `MAX_FILE_SIZE`, `CACHE_TTL` | Constants |
| **kebab-case** | `user-avatar.ts`, `auth-guard.ts` | Files |

### Type Safety

```typescript
// ✗ Avoid
const user: any = data;

// ✓ Prefer
import type { User } from '@/lib/types';
const user: User = data;

// ✓ Use Zod for runtime validation
const parsed = userSchema.safeParse(data);
if (!parsed.success) throw new Error('Invalid');
const user: User = parsed.data;
```

## Testing

### Test File Structure

```typescript
// tests/unit/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginUser } from '@/lib/auth-service';

describe('loginUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session on valid credentials', async () => {
    const result = await loginUser('user@example.com', 'password123');
    expect(result).toHaveProperty('session');
  });

  it('throws on invalid credentials', async () => {
    await expect(loginUser('user@example.com', 'wrong')).rejects.toThrow();
  });
});
```

### Coverage Requirements

- **Statements**: ≥ 70%
- **Branches**: ≥ 65%
- **Lines**: ≥ 70%
- **Functions**: ≥ 65%

Check coverage: `pnpm test -- --coverage`

### E2E Tests (Playwright)

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test('user can sign in', async ({ page }) => {
  await page.goto('http://localhost:4321/sign-in');
  await page.fill('input[type="email"]', 'user@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
```

**Run with 3 browsers**: `pnpm test:e2e` (Chromium, Firefox, WebKit)

## Security Best Practices

### Rate Limiting

```typescript
import { checkRateLimit } from '@/lib/rate-limit';

const rl = checkRateLimit(`login_${email}`, { 
  window: 900,  // 15 min
  max: 5        // max 5 attempts
});

if (!rl.allowed) {
  return new Response('Too many attempts', { status: 429 });
}
```

### Content Security Policy

Defined in `astro.config.mjs`. Key directives:

- `default-src 'self'` — no external scripts by default
- `script-src 'self' https://cdn.example.com` — whitelist domains
- `img-src 'self' data:` — images from self + data URLs

### SVG Uploads

```typescript
// Always serve SVG files as attachments (not inline)
return new Response(svgContent, {
  headers: { 'Content-Disposition': 'attachment; filename="image.svg"' },
});
```

## Performance

### Database Queries

- ✓ Use **Drizzle relationships** (1 query) instead of N+1 queries
- ✓ Use **indexes** on foreign keys and frequently filtered columns
- ✓ Use **caching** (loaders) for read-heavy data

```typescript
// ✗ N+1 queries (bad)
const users = await db.query.users.findMany();
for (const user of users) {
  user.org = await db.query.organizations.findFirst(/*...*/);
}

// ✓ Single query with relationship (good)
const users = await db.query.users.findMany({
  with: { org: true },
});
```

### Client-Side Performance

- Use **Astro islands** for interactive components (`client:load`, `client:idle`)
- Minimize JavaScript bundles (no unnecessary dependencies)
- **Lazy load** images (`loading="lazy"`)
- Use **CSS Grid/Flexbox** (no floats)

## Accessibility (WCAG 2.1 AA)

All new features must pass accessibility checks.

### Checklist

- [ ] Semantic HTML (`<button>`, `<nav>`, `<main>`, `<label>`)
- [ ] ARIA labels for complex widgets (`aria-label`, `aria-describedby`)
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Color contrast ≥ 4.5:1 (normal text), ≥ 3:1 (large text)
- [ ] Focus indicators visible
- [ ] Form errors linked to inputs (`aria-invalid`, `aria-describedby`)
- [ ] Image alt text required (`alt=""` only for decorative images)

**Test before submitting PR**:

```bash
pnpm a11y:pa11y      # Pa11y accessibility audit
pnpm a11y:lighthouse # Lighthouse performance audit
```

## Submitting Changes

### Branch Naming

```md
feature/add-user-profile       # New feature
bugfix/fix-search-typo         # Bug fix
docs/update-contributing       # Documentation
chore/upgrade-dependencies     # Maintenance
```

### Commit Messages

```md
feat: Add user profile page

- Implement profile form with Zod validation
- Add ProfileCard component with avatar upload
- Store avatar in S3 with signed URLs
- Add tests for profile mutations

Fixes #123
```

**Format**: `type(scope): description` — use **conventional commits**

### Pull Request Checklist

Before marking as ready for review:

- [ ] Branch created from `main`
- [ ] Commits follow conventional format
- [ ] `pnpm lint:fix` applied
- [ ] `pnpm check` passes (no TypeScript errors)
- [ ] `pnpm test` passes (new tests included)
- [ ] `pnpm test:e2e` passes (relevant scenarios)
- [ ] Coverage ≥ thresholds
- [ ] Accessibility audit passes (`pnpm a11y`)
- [ ] All 4 locales updated (if adding strings)
- [ ] Documentation updated (if needed)
- [ ] No console errors in browser
- [ ] `.env` secrets NOT committed

### Code Review

A maintainer will:

1. Review code for patterns & security
2. Run full QA suite (`pnpm qa`)
3. Request changes if needed
4. Merge when approved ✓

## Resources

- **Astro Docs**: <https://docs.astro.build>
- **better-auth**: <https://better-auth.com>
- **Drizzle ORM**: <https://orm.drizzle.team>
- **Tailwind CSS**: <https://tailwindcss.com>
- **Playwright**: <https://playwright.dev>
- **Zod**: <https://zod.dev>

## Questions?

Open an issue or start a discussion in the repository. Happy coding! 🚀
