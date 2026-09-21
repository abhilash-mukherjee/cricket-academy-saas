import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "./page";
import LoginPage from "./login/page";

const FEATURE_CARDS = [
  {
    title: "Get Discovered",
    body: "Give your academy a search-optimized online presence that helps new athletes and parents find you through Google.",
  },
  {
    title: "Fill Your Batches",
    body: "Let athletes register online with a streamlined intake process. Capture the information you need without the back-and-forth.",
  },
  {
    title: "Know Who's Showing Up",
    body: "Track attendance effortlessly across your batches and keep a clear record of athlete participation.",
  },
  {
    title: "Keep Memberships on Track",
    body: "Automate renewal reminders and handle subscription changes, expirations, and edge cases without manual follow-ups.",
  },
] as const;

function visibleText(html: string): string {
  return html
    .replaceAll("&#x27;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

describe("product homepage", () => {
  it("shows four feature cards with the pitch copy, not as links", () => {
    const html = renderToStaticMarkup(<Home />);
    const afterCta = html.split("Start your Academy").at(-1) ?? "";
    const afterCtaText = visibleText(afterCta);

    expect(html.split("Start your Academy")).toHaveLength(2);

    for (const card of FEATURE_CARDS) {
      expect(afterCtaText).toContain(card.title);
      expect(afterCtaText).toContain(card.body);
    }

    expect(afterCta).not.toMatch(/<a\b/);
    expect(afterCtaText).toContain(
      "Everything Your Academy Needs, In One Place",
    );
  });

  it("ends with a single centered muted copyright line", () => {
    const html = renderToStaticMarkup(<Home />);
    const afterCards = html.split("Keep Memberships on Track").at(-1) ?? "";
    const footer = afterCards.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0] ?? "";

    expect(footer).toContain("© 2026 restartHQ");
    expect(html.match(/© 2026 restartHQ/g)).toHaveLength(1);
    expect(footer).toMatch(/\btext-center\b/);
    expect(footer).toMatch(/\btext-base-content\/60\b/);
    expect(footer).not.toContain("Privacy");
    expect(footer).not.toContain("Terms");
    expect(footer).not.toContain("Contact");
  });

  it("keeps the hero full-viewport with a header that scrolls away", () => {
    const html = renderToStaticMarkup(<Home />);
    const hero = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? "";
    const navbar = hero.match(/class="[^"]*\bnavbar\b[^"]*"/)?.[0] ?? "";

    expect(hero).toMatch(/\bh-dvh\b/);
    expect(hero).toMatch(/\bsnap-start\b/);
    expect(hero).toContain("Sign in");
    expect(hero).toContain("Start your Academy");
    expect(hero).not.toContain("Get Discovered");
    expect(navbar).not.toMatch(/\bsticky\b/);
    expect(navbar).not.toMatch(/\bfixed\b/);
    expect(html.indexOf("Get Discovered")).toBeGreaterThan(html.indexOf("</main>"));
  });

  it("snaps from the hero to a feature section that fills the viewport, then scrolls inside it", () => {
    const html = renderToStaticMarkup(<Home />);
    const scroller = html.match(/<div class="[^"]*\bh-dvh\b[^"]*\boverflow-y-auto\b[^"]*"/)?.[0] ?? "";
    const features =
      html.match(/<section class="[^"]*\bbg-base-100\b[^"]*">[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(scroller).toMatch(/\bsnap-y\b/);
    expect(scroller).toMatch(/\bsnap-mandatory\b/);
    expect(features).toMatch(/\bmin-h-dvh\b/);
    expect(features).toMatch(/\bsnap-start\b/);
    expect(features).toContain("Everything Your Academy Needs, In One Place");
    expect(features).toMatch(/\bgrid-cols-1\b/);
    expect(features).toMatch(/\bmd:grid-cols-2\b/);
    expect(features).toMatch(
      /flex-1 flex-col justify-center[\s\S]*<h2\b[\s\S]*<div class="grid /,
    );
  });

  it("gives each feature card an inline stroke icon", () => {
    const html = renderToStaticMarkup(<Home />);
    const articles = html.match(/<article\b[\s\S]*?<\/article>/g) ?? [];

    expect(articles).toHaveLength(4);
    for (const article of articles) {
      expect(article).toMatch(/<svg\b/);
      expect(article).toMatch(/stroke="#2B64F6"/);
    }
  });
});

describe("login page chrome", () => {
  it("stays a full-viewport hero without feature cards or a copyright footer", async () => {
    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Sign in");
    expect(html).toContain("min-h-dvh");
    expect(html).not.toContain("Get Discovered");
    expect(html).not.toContain("Fill Your Batches");
    expect(html).not.toContain("Keep Memberships on Track");
    expect(html).not.toContain("Everything Your Academy Needs, In One Place");
    expect(html).not.toContain("© 2026 restartHQ");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("snap-mandatory");
  });
});
