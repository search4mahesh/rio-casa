// @vitest-environment jsdom
/**
 * The gallery viewer, from a keyboard.
 *
 * It was mouse-only in every respect that matters. The grid tiles were
 * `<div onClick>` — not in the tab order, opening for no key, and announced as
 * a photograph with no hint that they did anything. The overlay they opened
 * had no Escape, no arrows behind its chevrons, no `role="dialog"`, no focus
 * trap and no focus restore, and the page kept scrolling underneath it.
 *
 * These assert the behaviour a keyboard user experiences, not the attributes:
 * `getByRole` performs the same lookup assistive technology does, and the
 * key presses are the ones a person would actually make.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";

const MESSAGES: Record<string, string> = {
  title: "Gallery",
  subtitle: "Moments captured",
  lightboxLabel: "Photo viewer",
  close: "Close",
  previous: "Previous photo",
  next: "Next photo",
  filterLabel: "Filter photographs",
  // Nested under `gallery.categories` in the real store, which is where the
  // filter labels moved to when they stopped being a literal map in the
  // component.
  "categories.all": "All Photos",
  "categories.rooms": "Rooms",
  "categories.amenities": "Amenities",
  "categories.nature": "Exterior & Views",
};
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "viewPhoto") return `View ${values?.alt}`;
    if (key === "photoPosition") return `${values?.index} of ${values?.total}`;
    if (key === "photoCount") return `${values?.count} photos`;
    return MESSAGES[key] ?? key;
  },
}));

// next/image renders a plain img under test; `fill` and `sizes` are not DOM
// attributes and React would warn about them on every render.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import GalleryGrid from "@/components/sections/GalleryGrid";

const IMAGES = [
  { id: "g1", src: "/a.jpg", category: "rooms", alt: "Standard Room bed" },
  { id: "g2", src: "/b.jpg", category: "rooms", alt: "Deluxe Room balcony" },
  { id: "g3", src: "/c.jpg", category: "nature", alt: "Valley at dawn" },
];

beforeEach(() => {
  document.body.style.overflow = "";
});

/** Open the viewer the way a keyboard user would: tab to a tile, press Enter. */
async function openByKeyboard(user: ReturnType<typeof userEvent.setup>, alt: string) {
  const tile = screen.getByRole("button", { name: `View ${alt}` });
  tile.focus();
  await user.keyboard("{Enter}");
  return tile;
}

describe("gallery grid", () => {
  it("makes every photograph a real control, reachable by keyboard", () => {
    render(<GalleryGrid images={IMAGES} />);
    for (const img of IMAGES) {
      expect(screen.getByRole("button", { name: `View ${img.alt}` })).toBeTruthy();
    }
  });

  it("says which filter is active, not just which one looks filled in", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    const all = screen.getByRole("button", { name: "All Photos", pressed: true });
    expect(all).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Rooms" }));
    expect(screen.getByRole("button", { name: "Rooms", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All Photos", pressed: false })).toBeTruthy();
  });
});

describe("gallery lightbox", () => {
  it("opens from the keyboard and is announced as a modal dialog", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    await openByKeyboard(user, "Standard Room bed");

    const dialog = screen.getByRole("dialog", { name: "Photo viewer" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("puts focus inside the dialog, on the way out of it", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    await openByKeyboard(user, "Standard Room bed");

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }))
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    await openByKeyboard(user, "Standard Room bed");
    expect(screen.queryByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns focus to the photograph that opened it", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    const tile = await openByKeyboard(user, "Deluxe Room balcony");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(document.activeElement).toBe(tile));
  });

  it("moves through the set with the arrow keys the chevrons stand for", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    await openByKeyboard(user, "Standard Room bed");
    expect(screen.getByText("1 of 3")).toBeTruthy();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("2 of 3")).toBeTruthy();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("1 of 3")).toBeTruthy();
  });

  it("wraps at both ends rather than dead-ending", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    await openByKeyboard(user, "Standard Room bed");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("3 of 3")).toBeTruthy();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("1 of 3")).toBeTruthy();
  });

  /**
   * Without the trap, Tab walks off into the grid underneath — which is still
   * in the document, now hidden behind a full-screen overlay. Focus goes
   * somewhere the guest can neither see nor get back from.
   */
  it("keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    await openByKeyboard(user, "Standard Room bed");
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("stops the page behind it from scrolling, and lets it go again", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    await openByKeyboard(user, "Standard Room bed");
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  /**
   * The viewer indexes into the *filtered* list, so narrowing the filter while
   * it is open could leave it pointing past the end — a crash on the next
   * render rather than a closed dialog.
   */
  it("survives the filter narrowing under it", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid images={IMAGES} />);

    await openByKeyboard(user, "Valley at dawn");
    expect(screen.getByText("3 of 3")).toBeTruthy();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Rooms" }));
    expect(screen.getAllByRole("button", { name: /^View / })).toHaveLength(2);
  });
});

/**
 * The filter list and the string store have to agree.
 *
 * next-intl does not fall back: a category added to the component and not to
 * `messages/en.json` renders `categories.<name>` to the visitor as a button
 * label. The tests above cannot catch that — they mock `useTranslations` and
 * supply their own map, which is exactly the blind spot a real-file check
 * covers.
 */
describe("gallery filter labels", () => {
  const source = readFileSync("components/sections/GalleryGrid.tsx", "utf8");
  const declared = source
    .slice(source.indexOf("const categories = ["))
    .slice(0, source.slice(source.indexOf("const categories = [")).indexOf("]"))
    .match(/"([a-z]+)"/g)!
    .map((q) => q.replace(/"/g, ""));

  const messages = JSON.parse(readFileSync("messages/en.json", "utf8"));
  const labels: Record<string, string> = messages.gallery.categories;

  it("reads the four filters out of the component", () => {
    expect(declared).toEqual(["all", "rooms", "amenities", "nature"]);
  });

  it("has a label for every filter the page offers", () => {
    const missing = declared.filter((c) => !labels[c]);
    expect(
      missing,
      "A filter with no key under gallery.categories renders its own key path " +
        "to the visitor — next-intl does not fall back."
    ).toEqual([]);
  });

  /**
   * The other direction. `dining` and `events` sat here for a long time,
   * matching no filter the gallery offers and no row in `gallery_images` —
   * copy that reads as a live option nobody can reach.
   */
  it("has no label for a filter the page does not offer", () => {
    expect(Object.keys(labels).filter((k) => !declared.includes(k))).toEqual([]);
  });
});
