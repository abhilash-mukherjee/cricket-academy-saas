import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Loading from "./loading";

describe("staff /app Loading fallback", () => {
  it("shows a centered spinner and the word Loading as a status, with the same page padding as other /app screens", () => {
    const html = renderToStaticMarkup(<Loading />);

    expect(html).toMatch(/<main[^>]*class="[^"]*\bp-6\b/);
    expect(html).toContain('role="status"');
    expect(html).toContain("loading-spinner");
    expect(html).toContain("Loading");
  });
});
