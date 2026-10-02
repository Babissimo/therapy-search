import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, ExternalLink, Globe, Mail, Phone, type LucideIcon } from "lucide-react";
import { ukcpProfileUrl } from "@shared/query";
import type { Profile } from "@shared/types";
import { ErrorLine } from "@/components/ErrorLine";
import { SkeletonText } from "@/components/SkeletonText";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { NEW_TAB } from "@/lib/newTab";

/**
 * `title` gives the whole of a text that is shortened or may be cut off. A `verbatim` text, an address or a number, is
 * left as it is by a browser translating the page. `reaches` marks a way to get in touch, not to read more.
 */
type Item = {
  icon: LucideIcon;
  kind?: string;
  text: string;
  title?: string;
  href: string;
  external?: boolean;
  verbatim?: boolean;
  reaches?: boolean;
};

type Props = {
  profile: Profile;
  /** When the visitor follows the phone or email link, which may mean they got in touch. */
  onReach?: (link: HTMLAnchorElement) => void;
};

/** Every way to reach the therapist, each marked by an icon. UKCP gives phone and website only on request, made as the profile opens. */
export function ContactList({ profile, onReach }: Props) {
  const { contactId } = profile;
  const contact = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => api.contact(contactId ?? ""),
    enabled: contactId !== undefined,
    // UKCP answers every request afresh, so a visit asks once per therapist.
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const { phone, website } = contact.data ?? {};
  const email = profile.email ?? (profile.emailInContact ? contact.data?.email : undefined);

  const items: Item[] = [];
  if (phone) items.push({ icon: Phone, kind: "Telephone", text: phone, href: `tel:${phone.replace(/\s/g, "")}`, verbatim: true, reaches: true });
  if (email) items.push({ icon: Mail, kind: "Email", text: email, title: email, href: `mailto:${email}`, verbatim: true, reaches: true });
  if (website) items.push({ icon: Globe, kind: "Website", text: shortUrl(website), title: website, href: website, external: true, verbatim: true });
  for (const url of profile.social) {
    if (url !== website) items.push({ icon: AtSign, text: socialName(url), title: url, href: url, external: true, verbatim: true });
  }
  items.push({ icon: ExternalLink, text: "View on UKCP", href: ukcpProfileUrl(profile.slug), external: true });

  return (
    <div className="space-y-1">
      <ContactRow>
        {items.map((item) => (
          <li key={item.href} className="shrink-0 @lg:max-w-full @lg:min-w-0 @lg:shrink">
            <a
              href={item.href}
              title={item.title}
              aria-label={nameOf(item)}
              className="relative inline-flex max-w-full touch-target items-center gap-1.5 hover:underline"
              onClick={item.reaches ? (event) => onReach?.(event.currentTarget) : undefined}
              {...(item.external && { target: "_blank", rel: "noreferrer" })}
            >
              <item.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span translate={item.verbatim ? "no" : undefined} className="truncate">
                {item.text}
              </span>
            </a>
          </li>
        ))}
        {contact.isLoading && (
          <li className="shrink-0">
            <SkeletonText className="w-36" />
            <span className="sr-only">Loading contact details</span>
          </li>
        )}
      </ContactRow>
      {contact.error && (
        // Clear, on a touch screen, of the links' targets above.
        <ErrorLine className="pointer-coarse:pt-6">
          {contact.error.message}{" "}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => contact.refetch()}>
            Try again
          </Button>
        </ErrorLine>
      )}
    </div>
  );
}

/** A link's name: its kind before its text, and after it that it opens a new tab. Left to its text when there is neither. */
function nameOf({ kind, text, external }: Item): string | undefined {
  if (!kind && !external) return undefined;
  return [kind ? `${kind}: ${text}` : text, external && NEW_TAB].filter(Boolean).join(" ");
}

/** The contact row while the profile loads, with room for the usual phone, email, website and link to UKCP. */
export function ContactListSkeleton() {
  return (
    <ContactRow>
      {["w-24", "w-40", "w-44", "w-24"].map((width, i) => (
        <li key={i} className="shrink-0">
          <SkeletonText className={width} />
        </li>
      ))}
    </ContactRow>
  );
}

/**
 * One row that scrolls sideways where the header is narrow, so the header stays short enough to keep in view. On a touch
 * screen it is padded for the links' targets, which its scrolling would otherwise clip, and drawn out by as much to keep
 * its place.
 */
function ContactRow({ children }: { children: ReactNode }) {
  return (
    <ul className="flex gap-x-4 gap-y-1 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none] pointer-coarse:-my-3 pointer-coarse:gap-y-6 pointer-coarse:py-3 @lg:flex-wrap @lg:overflow-visible">
      {children}
    </ul>
  );
}

/** A web address as a person would say it: its host without "www.", then the rest without a trailing slash. */
function splitUrl(url: string): { host: string; rest: string } | undefined {
  try {
    const { hostname, pathname, search } = new URL(url);
    return { host: hostname.replace(/^www\./, ""), rest: pathname.replace(/\/$/, "") + search };
  } catch {
    return undefined;
  }
}

function shortUrl(url: string): string {
  const parts = splitUrl(url);
  return parts ? parts.host + parts.rest : url;
}

const NETWORKS: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"],
  [/(^|\.)facebook\.com$|^fb\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(twitter|x)\.com$/, "X"],
  [/(^|\.)threads\.(net|com)$/, "Threads"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)bsky\.app$/, "Bluesky"],
];

/** The site a social link goes to, by its address: UKCP's own label for it names the form field it was entered in. */
export function socialName(url: string): string {
  const host = splitUrl(url)?.host ?? url;
  return NETWORKS.find(([pattern]) => pattern.test(host))?.[1] ?? host;
}
