import type { DivIcon } from "leaflet";
import type { TherapistCard } from "@shared/types";
import { elementIcon } from "@/components/ui/map";
import { STATUS_LABEL } from "@/shortlist/status";
import type { Status } from "@/shortlist/store";
import { isRemoteOnly } from "./pins";

const SINGLE = 40;
const STACKED = 32;
// Each further avatar in a stack shows this much of itself: 32 px wide, overlapping by 12 (-space-x-3).
const STEP = 20;
// lucide's "video" icon, inlined because pin icons are built outside React.
const VIDEO_SVG = outline('<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>');
// lucide's "bookmark", filled as the shortlist button's is once someone is on it.
const BOOKMARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></svg>';

/** A status a pin is badged with: any but "To contact", which a shortlisted therapist is until marked otherwise. */
type Marked = Exclude<Status, "toContact">;
// lucide's icons for the statuses (STATUS_ICON), inlined as the ones above are.
const STATUS_SVG: Record<Marked, string> = {
  maybe: outline(
    '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
  ),
  contacted: outline(
    '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  ),
  waiting: outline(
    '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
  ),
  consultation: outline('<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="m9 15 2 2 4-4"/>'),
  seeing: outline('<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>'),
  setAside: outline('<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>'),
};

const CENTRE: [number, number] = [27, 33];
// lucide's "map-pin", filled and ringed, in a view cropped to it so its tip meets the bottom edge.
const CENTRE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="3 1 18 22" class="size-full drop-shadow-sm"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" class="fill-highlight stroke-background" stroke-width="1.5"/><circle cx="12" cy="10" r="3" class="fill-background"/></svg>';

/** Where the search is centred: amber, which shows on the tinted tiles light and dark, and a pin rather than an avatar, so it reads as no therapist. */
export function centreIcon(): DivIcon {
  const pin = element("span", "block size-full");
  pin.setAttribute("aria-hidden", "true");
  pin.innerHTML = CENTRE_SVG;
  return elementIcon(pin, CENTRE, "tip");
}

/** What a pin shows of a therapist, which a profile has as well as a card. */
type Face = Pick<TherapistCard, "slug" | "name" | "initials" | "photoUrl" | "sessionTypes">;

/**
 * One therapist's photo or initials; a pin or cluster for several shows up to three, stacked, with the count. Anyone in
 * `shortlisted` is badged, and leads a stack. A lone therapist's status in `statuses` is badged too; a stack's avatars
 * overlap too closely for a badge each.
 */
export function pinIcon(therapists: Face[], shortlisted?: ReadonlySet<string>, statuses?: ReadonlyMap<string, Status>): DivIcon {
  const onShortlist = (therapist: Face) => shortlisted?.has(therapist.slug) ?? false;
  const listed = therapists.filter(onShortlist);
  const [first] = therapists;
  if (therapists.length === 1 && first) {
    const status = statuses?.get(first.slug);
    const marked = status === "toContact" ? undefined : status;
    const face = avatar(first, "size-10 text-sm");
    if (isRemoteOnly(first)) face.append(remoteBadge());
    if (listed.length > 0) face.append(shortlistBadge("-top-1 -left-1"));
    if (marked) face.append(statusBadge(marked));
    const pin = holder([face]);
    const notes = [isRemoteOnly(first) && "remote sessions only", listed.length > 0 && "on your shortlist", marked && STATUS_LABEL[marked].toLowerCase()];
    label(pin, [first.name, ...notes].filter(Boolean).join(", "));
    return elementIcon(pin, [SINGLE, SINGLE]);
  }
  const shown = [...listed, ...therapists.filter((therapist) => !onShortlist(therapist))].slice(0, 3);
  const stack = holder(shown.map((therapist) => avatar(therapist, "size-8 text-xs")));
  // Level with the count, at the stack's other end.
  if (listed.length > 0) stack.append(shortlistBadge("-top-1.5 -left-1.5"));
  const count = element(
    "span",
    "absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.7rem] font-medium text-primary-foreground ring-2 ring-background",
  );
  count.textContent = String(therapists.length);
  stack.append(count);
  label(stack, `${therapists.length} therapists here` + (listed.length > 0 ? `, ${listed.length} on your shortlist` : ""));
  return elementIcon(stack, [STACKED + (shown.length - 1) * STEP, STACKED]);
}

/** Leaflet renders the icon as the marker button's whole content, so the icon itself carries the button's accessible name. */
function label(root: HTMLElement, name: string): void {
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", name);
}

/** A pin's avatars, overlapping, in a layer of their own so the rings of a marked pin (index.css) sit behind them all. */
function holder(avatars: HTMLElement[]): HTMLElement {
  const root = element("span", "relative isolate flex -space-x-3");
  root.append(...avatars);
  return root;
}

function avatar(therapist: Face, size: string): HTMLElement {
  // Initials without a photo stand on slate, as on the cards; with one, they stay muted beneath it while it loads.
  const colour = therapist.photoUrl ? "bg-muted text-muted-foreground" : "bg-primary font-heading text-primary-foreground";
  const circle = element(
    "span",
    `pin-avatar relative flex ${size} shrink-0 items-center justify-center rounded-full font-medium shadow-md ring-2 ring-background ${colour}`,
  );
  circle.textContent = therapist.initials;
  if (therapist.photoUrl) {
    // Important, because Leaflet's own stylesheet sets `width: auto` on marker images and outranks any utility.
    const img = element("img", "absolute inset-0 size-full! rounded-full object-cover");
    img.src = therapist.photoUrl;
    img.alt = "";
    // A photo that fails to load leaves the initials showing.
    img.addEventListener("error", () => img.remove());
    circle.append(img);
  }
  return circle;
}

function remoteBadge(): HTMLElement {
  return badge("-right-1 -bottom-1 text-foreground", "Remote sessions only", VIDEO_SVG);
}

/** At the top left, clear of the remote badge at the bottom right and a stack's count at the top right. */
function shortlistBadge(place: string): HTMLElement {
  return badge(`${place} text-primary`, "On your shortlist", BOOKMARK_SVG);
}

/** At the bottom left, clear of the remote badge at the bottom right. */
function statusBadge(status: Marked): HTMLElement {
  return badge("-bottom-1 -left-1 text-foreground", STATUS_LABEL[status], STATUS_SVG[status]);
}

/** A small disc on a pin's rim holding an icon; `look` places and colours it. */
function badge(look: string, title: string, svg: string): HTMLElement {
  const disc = element("span", `absolute ${look} flex size-5 items-center justify-center rounded-full bg-background shadow ring-1 ring-border [&>svg]:size-3`);
  disc.title = title;
  disc.innerHTML = svg;
  return disc;
}

/** A lucide outline icon from its shapes, drawn as lucide's own components draw it. */
function outline(shapes: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
