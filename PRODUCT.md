# Product

## Register

brand

## Users

Engineers, platform/DevOps leads, and technical decision-makers evaluating whether to adopt the Fleetworks suite for their org's infrastructure. They land here from a link or search while already deep in infra work — impatient, skeptical of marketing fluff, and fluent in the domain (services, DNS, deployments, directory, cloud governance). The product is heading into public beta with live demos; visitors may convert straight to a live subdomain or a demo request.

## Product Purpose

`fleetworks-web` is the apex marketing site at `fleetworks.dev` for the Fleetworks suite — a unified control plane for org infrastructure spanning 6 apps (the apex home page plus Yellow Pages/catalog, Rolodex/directory, Chorus/DNS, Helmsman/deployments, Warden/cloud governance). Success = a technical visitor understands the "one suite, one control plane" narrative in one scroll, self-selects into the right app page, and either opens that app's live subdomain or submits a demo request.

## Brand Personality

Precise, quietly confident, built-by-operators-for-operators. Three words: **exact, unflashy, capable.** This is infrastructure tooling — the tone is closer to a well-run internal platform team's docs site than a consumer SaaS pitch. Confidence is shown through clarity and restraint, not hype copy or decoration.

## Anti-references

- Generic consumer SaaS: pastel/purple gradients, cutesy blob illustrations, stock photos of laptops-in-cafes.
- Cream/parchment "editorial" aesthetic (serif display type, italic accents, warm off-white backgrounds) — wrong register for an infra tool aimed at engineers, even though this is a marketing surface.
- Real product screenshots as hero imagery (explicit decision: screenshots go stale during rapid pre-beta iteration; hero imagery is illustrative/abstract instead, and this decision itself is locked — only the visual style of that imagery is open).
- Hero-metric SaaS cliché (big number + label + gradient accent) and identical icon-card grids for the 5-app overview.

## Design Principles

1. **Show technical credibility through precision, not decoration.** Every visual choice should read as "built by people who run infra," not "built by a marketing agency."
2. **One suite, one system — five accents.** The apex site establishes a single visual language (hero treatment, layout grammar, motion) that every one of the 5 app pages reuses, recolored to that app's own `accentColor` from `@fleet-works/suite-nav`. Consistency across pages is the pitch, not a limitation.
3. **Respect the engineer's time.** Lead with what the product does and who it's for; no scroll-jacking, no filler copy, no unnecessary steps between "curious" and "open the app" or "request a demo."
4. **Restraint over spectacle.** The existing design tokens (near-black ink, white paper, muted neutrals, system sans) already signal "serious tool" — new visual work should extend that restraint, not fight it with maximalist color or ornament.
5. **Imagery replaces proof, not decoration.** Since screenshots are off the table, hero imagery must still communicate *what this actually does* (infrastructure/control-plane concepts rendered abstractly) rather than being generic mood art.

## Accessibility & Inclusion

WCAG 2.1 AA minimum (matches the bar used across the other 5 Fleetworks apps). Respect `prefers-reduced-motion` for any hero/reveal animation. Body text and any imagery-overlaid text must hit standard contrast ratios against the near-black/white token pair.
