# Button

```astro
---
import { Button } from "@components/starwind/button";
---

<Button>Button</Button>
```

## Installation

```bash
npx starwind@latest add button
```

## Link

The Button component can also function as a link (`<a>` tag) by providing an `href` prop.

```astro
---
import { Button } from "@components/starwind/button";
---

<Button href="#link">Button</Button>
```

## Usage

### variant

```astro
---
import { Button } from "@components/starwind/button";
---

<Button variant="default">default</Button>
<Button variant="primary">primary</Button>
<Button variant="secondary">secondary</Button>
<Button variant="outline">outline</Button>
<Button variant="ghost">ghost</Button>
<Button variant="info">info</Button>
<Button variant="success">success</Button>
<Button variant="warning">warning</Button>
<Button variant="error">error</Button>
```

### size

```astro
---
import { Button } from "@components/starwind/button";
import Mail from "@tabler/icons/outline/mail.svg";
---

<Button size="sm">small</Button>
<Button size="md">medium</Button>
<Button size="lg">large</Button>
<Button size="icon"><Mail /></Button>
<Button size="icon-sm"><Mail /></Button>
<Button size="icon-lg"><Mail /></Button>
```

### radius

> **Info:** With v2.0.0 of this component, it no longer has a radius prop, and instead the classes you pass in will be merged with the component's default classes using `tailwind-variants`. This means you can simply pass the class `rounded-full` or similar.

```astro
---
import { Button } from "@components/starwind/button";
---

<Button class="rounded-none">btn none</Button>
<Button class="rounded-xs">btn xs</Button>
<Button class="rounded-sm">btn sm</Button>
<Button class="rounded-md">btn md</Button>
<Button class="rounded-lg">btn lg</Button>
<Button class="rounded-xl">btn xl</Button>
<Button class="rounded-full">btn full</Button>
```

## Button API Reference

A versatile button component with multiple variants and sizes.

|Prop|Type|Default|
|---|---|---|
|`variant`|`"default" \| "primary" \| "secondary" \| "outline" \| "ghost" \| "info" \| "success" \| "warning" \| "error"`|`"default"`|
|`size`|`"sm" \| "md" \| "lg" \| "icon" \| "icon-sm" \| "icon-lg"`|`"md"`|
|`href`|`string`|-|
|`class`|`string`|-|

```astro
<Button variant="default" size="md">Button</Button>
```

**Additional Notes:**

- `size`: Determines the button size. Use `"icon"`, `"icon-sm"`, or `"icon-lg"` for icon-only buttons
- `href`: When provided, renders the button as a link (`<a>` tag) instead of a `<button>`
