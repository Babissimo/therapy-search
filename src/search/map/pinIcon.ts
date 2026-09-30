import type { DivIcon } from "leaflet";
import type { TherapistCard } from "@shared/types";
import { elementIcon } from "@/components/ui/map";
import { isRemoteOnly } from "./pins";

const SINGLE = 40;
const STACKED = 32;
// Each further avatar in a stack shows this much of itself: 32 px wide, overlapping by 12 (-space-x-3).
const STEP = 20;
// lucide's "video" icon, inlined because pin icons are built outside React.
const VIDEO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';
// lucide's "bookmark", filled as the shortlist button's is once someone is on it.
const BOOKMARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></svg>';

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

/**
 * One therapist's photo or initials; a pin or cluster for several shows up to three, stacked, with the count. Anyone in
 * `shortlisted` is badged, and leads a stack.
 */
export function pinIcon(therapists: TherapistCard[], shortlisted?: ReadonlySet<string>): DivIcon {
  const onShortlist = (therapist: TherapistCard) => shortlisted?.has(therapist.slug) ?? false;
  const listed = therapists.filter(onShortlist);
  const [first] = therapists;
  if (therapists.length === 1 && first) {
    const face = avatar(first, "size-10 text-sm");
    if (isRemoteOnly(first)) face.append(remoteBadge());
    if (listed.length > 0) face.append(shortlistBadge("-top-1 -left-1"));
    const pin = holder([face]);
    label(pin, first.name + (isRemoteOnly(first) ? ", remote sessions only" : "") + (listed.length > 0 ? ", on your shortlist" : ""));
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

function avatar(therapist: TherapistCard, size: string): HTMLElement {
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

/** A small disc on a pin's rim holding an icon; `look` places and colours it. */
function badge(look: string, title: string, svg: string): HTMLElement {
  const disc = element("span", `absolute ${look} flex size-5 items-center justify-center rounded-full bg-background shadow ring-1 ring-border [&>svg]:size-3`);
  disc.title = title;
  disc.innerHTML = svg;
  return disc;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
