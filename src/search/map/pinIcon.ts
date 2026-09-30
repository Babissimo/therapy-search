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

const CENTRE: [number, number] = [27, 33];
// lucide's "map-pin", filled and ringed, in a view cropped to it so its tip meets the bottom edge.
const CENTRE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="3 1 18 22" class="size-full drop-shadow-sm"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" class="fill-sky-500 stroke-background" stroke-width="1.5"/><circle cx="12" cy="10" r="3" class="fill-background"/></svg>';

/** Where the search is centred: blue, which shows on light and dark tiles alike, and a pin rather than an avatar, so it reads as no therapist. */
export function centreIcon(): DivIcon {
  const pin = element("span", "block size-full");
  pin.setAttribute("aria-hidden", "true");
  pin.innerHTML = CENTRE_SVG;
  return elementIcon(pin, CENTRE, "tip");
}

/** One therapist's photo or initials; a pin or cluster for several shows up to three, stacked, with the count. */
export function pinIcon(therapists: TherapistCard[]): DivIcon {
  const [first] = therapists;
  if (therapists.length === 1 && first) {
    const pin = avatar(first, "size-10 text-sm");
    if (isRemoteOnly(first)) pin.append(remoteBadge());
    label(pin, first.name + (isRemoteOnly(first) ? ", remote sessions only" : ""));
    return elementIcon(pin, [SINGLE, SINGLE]);
  }
  const shown = therapists.slice(0, 3);
  const stack = element("span", "relative flex -space-x-3");
  for (const therapist of shown) stack.append(avatar(therapist, "size-8 text-xs"));
  const count = element(
    "span",
    "absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.7rem] font-medium text-primary-foreground ring-2 ring-background",
  );
  count.textContent = String(therapists.length);
  stack.append(count);
  label(stack, `${therapists.length} therapists here`);
  return elementIcon(stack, [STACKED + (shown.length - 1) * STEP, STACKED]);
}

/** Leaflet renders the icon as the marker button's whole content, so the icon itself carries the button's accessible name. */
function label(root: HTMLElement, name: string): void {
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", name);
}

function avatar(therapist: TherapistCard, size: string): HTMLElement {
  const circle = element(
    "span",
    `relative flex ${size} shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground shadow-md ring-2 ring-background`,
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
  const badge = element(
    "span",
    "absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-background text-foreground shadow ring-1 ring-border [&>svg]:size-3",
  );
  badge.title = "Remote sessions only";
  badge.innerHTML = VIDEO_SVG;
  return badge;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
