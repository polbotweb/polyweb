# Design System — Catalogue des Composants

> Retour à l'[index](index.md)
>
> Voir aussi : [variants](variants.md) pour le système `tv()`, [create-component](create-component.md) pour créer un composant.

---

## Vue d'ensemble

**47 composants** répartis selon l'Atomic Design :

| Niveau | Emplacement | Composants |
| :-- | :-- | --: |
| Atoms | `src/components/atoms/` | 47 |
| Molecules | `src/components/molecules/` | — |
| Organisms | `src/components/organisms/` | AdminSidebar, AuthLayout, AuthSidebar, Footer, Header, OrgSidebar, Testimonials |
| Pages | `src/components/pages/` | Home, About, Contact, Legal, Auth (7), Admin (8), Org (2), CMS (1) |
| Wow | `src/components/wow/` | 8 effets visuels |

---

## 1. Accordion

| Composant | Import | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- | :-- |
| Accordion | `@atoms/accordion` | — | ✅ AccordionItems | Wrapper |
| AccordionItem | `@atoms/accordion` | `title`, `open`, `class` | ✅ Body | `@keyframes accordion-down/up` |

---

## 2. Alert

| Composant | Import | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- | :-- |
| Alert | `@atoms/alert` | `variant` (7), `class` | ✅ Description | `tv()` — auto `role="alert\|status"` |

**Variants** : default, primary, secondary, info, success, warning, error

---

## 3. AlertDialog

| Composant | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- |
| AlertDialog | — | ✅ | Wrapper |
| AlertDialogTrigger | `asChild` | ✅ | asChild pattern |
| AlertDialogContent | — | ✅ | Backdrop + dialog |
| AlertDialogHeader / Footer | — | ✅ | Layout |
| AlertDialogTitle / Description | — | ✅ | Texte |
| AlertDialogAction / Cancel | `class` | ✅ | Boutons |

---

## 4. AspectRatio

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| AspectRatio | `@atoms/aspect-ratio` | `ratio` | ✅ Image/Video |

---

## 5. Avatar

| Composant | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- |
| Avatar | `variant` (7), `size` (3) | ✅ | `tv()` — `<figure>` sémantique |
| AvatarImage | `src`, `alt` | — | Image |
| AvatarFallback | — | ✅ Initiales | Fallback |

**Variants** : default, primary, secondary, info, success, warning, error
**Sizes** : sm (8), md (10), lg (12)

---

## 6. Badge

| Composant | Import | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- | :-- |
| Badge | `@atoms/badge` | `variant` (9), `size` (3), `href` | ✅ | `tv()` + compoundVariants + polymorphic |

**Variants** : default, primary, secondary, outline, ghost, info, success, warning, error
**Sizes** : sm, md, lg
**Polymorphic** : `<a>` si `href`, `<div>` sinon. 9 compoundVariants hover pour isLink.

---

## 7. Breadcrumb

| Composant | Props | Slot |
| :-- | :-- | :-- |
| Breadcrumb | — | ✅ Wrapper |
| BreadcrumbList | — | ✅ Items |
| BreadcrumbItem | — | ✅ |
| BreadcrumbLink | `href` | ✅ |
| BreadcrumbPage | — | ✅ Current |
| BreadcrumbSeparator | — | ✅ Icon |
| BreadcrumbEllipsis | — | — |

---

## 8. Button

| Composant | Import | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- | :-- |
| Button | `@atoms/button` | `variant` (9), `size` (6), `href`, `disabled` | ✅ | `tv()` + polymorphic |

**Variants** : default, primary, secondary, outline, ghost, info, success, warning, error
**Sizes** : sm, md, lg, icon-sm, icon, icon-lg
**Polymorphic** : `<a>` si `href`, `<button>` sinon.

---

## 9. ButtonGroup

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| ButtonGroup | `@atoms/button-group` | `vertical`, `class` | ✅ Buttons |

---

## 10. Card

| Composant | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- |
| Card | `size` (default, sm) | ✅ | `tv()` + `group/card` + `data-size` |
| CardHeader | — | ✅ | `@container/card-header` + grid adaptatif |
| CardContent | — | ✅ | `group-data-[size=sm]/card:px-4` |
| CardFooter | — | ✅ | `bg-muted/50` + border-t |
| CardTitle | — | ✅ | `font-heading` |
| CardDescription | — | ✅ | `text-muted-foreground` |
| CardAction | — | ✅ | Grid position auto |

**7 sous-composants**. Les enfants héritent du size parent via `group-data-[size]/card:`.

---

## 11. Carousel

| Composant | Props | Slot |
| :-- | :-- | :-- |
| Carousel | `orientation`, `loop` | ✅ |
| CarouselContent | — | ✅ |
| CarouselItem | — | ✅ |
| CarouselPrevious / Next | — | — |

---

## 12. Checkbox

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Checkbox | `@atoms/checkbox` | `id`, `label`, `checked`, `disabled`, `required` | — |

---

## 13. Collapsible

| Composant | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- |
| Collapsible | `open` | ✅ | Wrapper |
| CollapsibleTrigger | `asChild` | ✅ | asChild pattern |
| CollapsibleContent | — | ✅ | Contenu |

---

## 14. Combobox

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Combobox | `@atoms/combobox` | `options`, `placeholder`, `label`, `error` | — |

---

## 15. Dialog

| Composant | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- |
| Dialog | `open` | ✅ | DialogHandler JS |
| DialogTrigger | `asChild`, `for` | ✅ | asChild pattern |
| DialogContent | `animationDuration` | ✅ | `tv()` ×3 (backdrop, content, close) |
| DialogHeader / Footer | — | ✅ | Layout |
| DialogTitle | — | ✅ | `<h2>` sémantique |
| DialogDescription | — | ✅ | `text-muted-foreground` |
| DialogClose | `asChild` | ✅ | asChild pattern |

**Nested dialogs** : CSS variables `--nested-offset`, `--nested-scale` pour empiler les modales.

---

## 16. Dropdown

| Composant | Props | Slot |
| :-- | :-- | :-- |
| Dropdown | `label`, `align` | ✅ |
| DropdownItem | `disabled`, `href` | ✅ |
| DropdownLabel / Separator | — | ✅ |

---

## 17. Dropzone

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Dropzone | `@atoms/dropzone` | `multiple`, `accept`, `maxSize` | ✅ Instruction |

---

## 18. Image

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Image | `@atoms/image` | `src`, `alt`, `width`, `height`, `loading` | — |

---

## 19. Input

| Composant | Import | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- | :-- |
| Input | `@atoms/input` | `type`, `size` (3), `placeholder`, `disabled` | — | `tv()` — `peer` + `aria-invalid` |

**Sizes** : sm (h-9), md (h-11), lg (h-12)

---

## 20. InputGroup

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| InputGroup | `@atoms/input-group` | `label`, `description`, `error` | ✅ Input/Select |

---

## 21. InputOTP

| Composant | Props | Slot |
| :-- | :-- | :-- |
| InputOTP | `length`, `onComplete` | ✅ |
| InputOTPGroup | — | ✅ |
| InputOTPSlot | `index` | — |
| InputOTPSeparator | — | — |

---

## 22. Item

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Item | `@atoms/item` | `selected`, `disabled`, `href` | ✅ |

---

## 23. Label

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Label | `@atoms/label` | `for`, `required` | ✅ |

---

## 24. NativeSelect

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| NativeSelect | `@atoms/native-select` | `options`, `label`, `error` | — |

---

## 25. Pagination

| Composant | Props | Slot |
| :-- | :-- | :-- |
| Pagination | — | ✅ |
| PaginationContent / PaginationItem | — | ✅ |
| PaginationLink | `href`, `isActive` | ✅ |
| PaginationNext / Previous / Ellipsis | — | — |

---

## 26. Popover

| Composant | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- |
| Popover | — | ✅ | Wrapper |
| PopoverTrigger | `asChild` | ✅ | asChild pattern |
| PopoverContent | `align`, `side`, `sideOffset` | ✅ | Floating UI |

---

## 27. Progress

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Progress | `@atoms/progress` | `value`, `max`, `color` | — |

---

## 28. Prose

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Prose | `@atoms/prose` | `class` | ✅ Rich text |

---

## 29. RadioGroup

| Composant | Props | Slot |
| :-- | :-- | :-- |
| RadioGroup | `name`, `defaultValue` | ✅ |
| RadioGroupItem | `value`, `label`, `id` | — |

---

## 30. Select (Custom)

| Composant | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- |
| Select | `name`, `defaultValue`, `required` | ✅ | SelectHandler JS |
| SelectTrigger | — | ✅ SelectValue | — |
| SelectValue | `placeholder` | — | — |
| SelectContent | — | ✅ | — |
| SelectItem | `value` | ✅ | — |
| SelectGroup / Label / Separator | — | ✅ | — |

**Keyboard** : Arrow keys, Home, End, Enter, Escape, typeahead search.

---

## 31. Separator

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Separator | `@atoms/separator` | `orientation` | — |

---

## 32. Sheet (Drawer)

| Composant | Props | Slot |
| :-- | :-- | :-- |
| Sheet | `side` | ✅ |
| SheetTrigger / Content / Header / Footer | — | ✅ |
| SheetTitle / Description | — | ✅ |

---

## 33. Sidebar

| Composant | Props | Slot |
| :-- | :-- | :-- |
| Sidebar | `collapsible` | ✅ |
| SidebarHeader / Content / Footer | — | ✅ |
| SidebarGroup / Menu / MenuItem | — | ✅ |

Utilise les tokens `--sidebar-*` dédiés (voir [tokens.md](tokens.md)).

---

## 34. Skeleton

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Skeleton | `@atoms/skeleton` | `variant`, `width`, `height` | — |

---

## 35. Slider

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Slider | `@atoms/slider` | `min`, `max`, `step`, `defaultValue` | — |

---

## 36. Spinner

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Spinner | `@atoms/spinner` | `size`, `color` | — |

---

## 37. Switch

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Switch | `@atoms/switch` | `checked`, `id`, `label` | — |

---

## 38. Table

| Composant | Slot |
| :-- | :-- |
| Table | ✅ |
| TableHeader / Body / Footer | ✅ |
| TableRow | ✅ |
| TableHead / Cell | ✅ |
| TableCaption | ✅ |

---

## 39. Tabs

| Composant | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- |
| Tabs | `defaultValue`, `syncKey` | ✅ | TabsHandler JS |
| TabsList | — | ✅ | `role="tablist"` |
| TabsTrigger | `value` | ✅ | `role="tab"` + `aria-selected` |
| TabsContent | `value` | ✅ | `role="tabpanel"` |

**Keyboard** : Arrow keys, Home, End. **Sync** : `syncKey` syncs tabs via localStorage.

---

## 40. Textarea

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Textarea | `@atoms/textarea` | `rows`, `resize`, `placeholder`, `error` | — |

---

## 41. ThemeToggle

| Composant | Import | Props | Slot | Pattern |
| :-- | :-- | :-- | :-- | :-- |
| ThemeToggle | `@atoms/theme-toggle` | `variant`, `size`, `ariaLabel` | Named slots (icons) | WeakMap + Set + CustomEvent sync |

Voir [theming.md](theming.md) pour le mécanisme complet.

---

## 42. Toast

| Composant | Props | Slot |
| :-- | :-- | :-- |
| Toast | `variant`, `duration` | ✅ |
| ToastAction | `altText` | ✅ |

---

## 43. Toggle

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Toggle | `@atoms/toggle` | `pressed`, `variant` | ✅ Icon |

---

## 44. Tooltip

| Composant | Props | Slot |
| :-- | :-- | :-- |
| TooltipProvider | — | ✅ Global wrapper |
| Tooltip | — | ✅ |
| TooltipTrigger | — | ✅ |
| TooltipContent | `side` | ✅ |

---

## 45. Video

| Composant | Import | Props | Slot |
| :-- | :-- | :-- | :-- |
| Video | `@atoms/video` | `src`, `controls`, `autoplay`, `poster` | — |
