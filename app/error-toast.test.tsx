import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorToast } from "./error-toast";

describe("ErrorToast", () => {
  it("shows an error alert toast with the message", () => {
    const html = renderToStaticMarkup(
      <ErrorToast
        message="Close this Batch for Registration first."
        onDismiss={vi.fn()}
      />,
    );

    expect(html).toContain("toast");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Close this Batch for Registration first.");
    expect(html).not.toContain("text-error text-sm");
  });

  it("renders nothing when there is no message", () => {
    const html = renderToStaticMarkup(
      <ErrorToast message={null} onDismiss={vi.fn()} />,
    );

    expect(html).toBe("");
  });
});
