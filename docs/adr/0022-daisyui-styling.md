# DaisyUI is the styling kit

The Next.js UI is Tailwind CSS plus DaisyUI: semantic components and one product theme for both the Academy public template and product chrome. Academies do not pick a DaisyUI theme; per-Academy colour is the white-label we deferred in ADR 0020. shadcn/ui or a CSS-in-JS kit would also work, but DaisyUI matches utility-first Tailwind on Vercel without a second component ownership model. Spacing, which Daisy components a screen uses, and dark mode stay in specs — not a second theme switcher.
