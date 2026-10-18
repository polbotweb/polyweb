# Accordion

```astro
---
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@components/starwind/accordion";
---

<Accordion defaultValue="item-1">
  <AccordionItem value="item-1">
    <AccordionTrigger>What is Astro?</AccordionTrigger>
    <AccordionContent>
      Astro is an web framework for building fast, scalable, and secure websites.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionTrigger>Why should I use Astro?</AccordionTrigger>
    <AccordionContent>
      Astro provides a set of features that make it an ideal choice for building fast,
      scalable, and secure websites.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-3">
    <AccordionTrigger>How do I get started with Astro?</AccordionTrigger>
    <AccordionContent>
      To get started with Astro, follow the instructions in the documentation.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

## Installation

```bash
npx starwind@latest add accordion
```

## Usage

### multiple

Use `type="multiple"` to allow multiple accordion items to be open at the same time.

```astro
---
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@components/starwind/accordion";
---

<Accordion type="multiple" defaultValue="item-1">
  <AccordionItem value="item-1">
    <AccordionTrigger>What is Astro?</AccordionTrigger>
    <AccordionContent>
      Astro is an web framework for building fast, scalable, and secure websites.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionTrigger>Why should I use Astro?</AccordionTrigger>
    <AccordionContent>
      Astro provides a set of features that make it an ideal choice for building fast,
      scalable, and secure websites.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-3">
    <AccordionTrigger>How do I get started with Astro?</AccordionTrigger>
    <AccordionContent>
      To get started with Astro, follow the instructions in the documentation.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

### defaultValue

Use the `defaultValue` prop to set the default open item. If the prop is not provided, no items will be open by default.

```astro
---
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@components/starwind/accordion";
---

<Accordion defaultValue="item-3">
  <AccordionItem value="item-1">
    <AccordionTrigger>What is Astro?</AccordionTrigger>
    <AccordionContent>
      Astro is an web framework for building fast, scalable, and secure websites.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionTrigger>Why should I use Astro?</AccordionTrigger>
    <AccordionContent>
      Astro provides a set of features that make it an ideal choice for building fast,
      scalable, and secure websites.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-3">
    <AccordionTrigger>How do I get started with Astro?</AccordionTrigger>
    <AccordionContent>
      To get started with Astro, follow the instructions in the documentation.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

## Accordion API Reference

The root component that contains all accordion items. It manages the state of the accordion items and handles keyboard interactions.

| Prop           | Type                     | Default    |
| -------------- | ------------------------ | ---------- |
| `type`         | `"single" \| "multiple"` | `"single"` |
| `defaultValue` | `string`                 | -          |
| `class`        | `string`                 | -          |

```astro
<Accordion type="single" defaultValue="item-1">
  <!-- AccordionItem components -->
</Accordion>
```

**Additional Notes:**

- `type`: Determines whether only one or multiple accordion items can be open at once
- `defaultValue`: The value of the item that should be open by default

### AccordionItem

The container for each individual accordion item.

| Prop    | Type     | Default  |
| ------- | -------- | -------- |
| `value` | `string` | Required |
| `class` | `string` | -        |

```astro
<AccordionItem value="item-1">
  <!-- AccordionTrigger and AccordionContent -->
</AccordionItem>
```

**Additional Notes:**

- `value`: A unique identifier for the accordion item

### AccordionTrigger

The button that toggles the accordion item. Clicking this component will expand or collapse the associated content.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `class` | `string` | -       |

```astro
<AccordionTrigger>What is Astro?</AccordionTrigger>
```

### AccordionContent

The content to be revealed when the accordion item is expanded.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `class` | `string` | -       |

```astro
<AccordionContent>
  Astro is a web framework for building fast, scalable, and secure websites.
</AccordionContent>
```

## Animation

This component requires an animation to function properly. It is automatically included when initializing a project with Starwind, but in case you have removed it, you can find the required code below.

```scss title="src/styles/starwind.css"
/* Tailwind CSS v4 theme definition */
@theme inline {
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;

  @keyframes accordion-down {
    from {
      height: 0;
    }
    to {
      height: var(--starwind-accordion-content-height);
    }
  }

  @keyframes accordion-up {
    from {
      height: var(--starwind-accordion-content-height);
    }
    to {
      height: 0;
    }
  }
}
```
