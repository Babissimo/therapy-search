import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, ExternalLink, Globe, Loader2, Mail, Phone, type LucideIcon } from "lucide-react";
import { ukcpProfileAddress, ukcpProfileUrl } from "@shared/query";
import type { Profile } from "@shared/types";
import { ErrorLine } from "@/components/ErrorLine";
import { FailureStatus, useFailure } from "@/components/FailedAlert";
import { SkeletonText } from "@/components/SkeletonText";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { NEW_TAB } from "@/lib/newTab";
import { cn } from "@/lib/utils";

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
  /** Where the link goes, which paper, unable to follow it, gives in place of a text that only names the site, or after its text. */
  printed?: { text: string; after?: boolean };
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
  // Held while asked again, so Try again keeps the keyboard until the first of the details takes it.
  const failure = useFailure<HTMLAnchorElement>(contact, contactId ?? "");
  const { phone, website } = contact.data ?? {};
  const email = profile.email ?? (profile.emailInContact ? contact.data?.email : undefined);

  const items: Item[] = [];
  if (phone) items.push({ icon: Phone, kind: "Telephone", text: phone, href: `tel:${phone.replace(/\s/g, "")}`, verbatim: true, reaches: true });
  if (email) items.push({ icon: Mail, kind: "Email", text: email, title: email, href: `mailto:${email}`, verbatim: true, reaches: true });
  if (website) items.push({ icon: Globe, kind: "Website", text: shortUrl(website), title: website, href: website, external: true, verbatim: true });
  for (const url of profile.social) {
    if (url !== website) items.push({ icon: AtSign, text: socialName(url), title: url, href: url, external: true, verbatim: true, printed: { text: shortUrl(url) } });
  }
  items.push({ icon: ExternalLink, text: "View on UKCP", href: ukcpProfileUrl(profile.slug), external: true, printed: { text: ukcpProfileAddress(profile.slug), after: true } });

  return (
    <div className="space-y-1">
      {/* Says each failure, and how its retry goes, once, for the error line, which keeps quiet. */}
      <FailureStatus failure={failure} />
      <ContactRow>
        {items.map((item, i) => (
          <li key={item.href} className="shrink-0 @lg/profile:max-w-full @lg/profile:min-w-0 @lg/profile:shrink print:max-w-full print:min-w-0 print:shrink">
            <a
              ref={i === 0 ? failure.landing : undefined}
              href={item.href}
              title={item.title}
              aria-label={nameOf(item)}
              className="relative inline-flex max-w-full touch-target items-center gap-1.5 hover:underline"
              onClick={item.reaches ? (event) => onReach?.(event.currentTarget) : undefined}
              {...(item.external && { target: "_blank", rel: "noreferrer" })}
            >
              <item.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              {/* Whole on paper, where nothing can show the rest. */}
              <span
                translate={item.verbatim ? "no" : undefined}
                className={cn("truncate print:overflow-visible print:whitespace-normal print:wrap-anywhere", item.printed && !item.printed.after && "print:hidden")}
              >
                {item.text}
              </span>
              {item.printed && (
                <span translate="no" className={cn("hidden print:inline print:wrap-anywhere", item.printed.after && "text-muted-foreground")}>
                  {item.printed.text}
                </span>
              )}
            </a>
          </li>
        ))}
        {contact.isLoading && !failure.error && (
          <li className="shrink-0">
            <SkeletonText className="w-36" />
            <span className="sr-only">Loading contact details</span>
          </li>
        )}
      </ContactRow>
      {failure.error && (
        // Clear, on a touch screen, of the links' targets above.
        <ErrorLine className="pointer-coarse:pt-6" quiet>
          {failure.error.message}{" "}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 aria-disabled:opacity-50"
            // Not disabled while retrying, which would drop focus; a second press is ignored.
            aria-disabled={failure.retrying}
            onClick={failure.retrying ? undefined : failure.retry}
          >
            {failure.retrying && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
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
 * One row that scrolls sideways where the header is narrow, so the header stays short enough to keep in view; paper wraps
 * it. On a touch screen it is padded for the links' targets, which its scrolling would otherwise clip, and drawn out by as
 * much to keep its place.
 */
function ContactRow({ children }: { children: ReactNode }) {
  return (
    <ul
      className={cn(
        "flex gap-x-4 gap-y-1 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none] pointer-coarse:-my-3 pointer-coarse:gap-y-6 pointer-coarse:py-3",
        "@lg/profile:flex-wrap @lg/profile:overflow-visible print:flex-wrap print:overflow-visible print:whitespace-normal",
      )}
    >
      {children}
    </ul>
  );
}

/** A web address as a person would say it: its host without "www.", then the rest without a trailing slash or escapes. */
function splitUrl(url: string): { host: string; rest: string } | undefined {
  try {
    const { hostname, pathname, search, hash } = new URL(url);
    return { host: hostname.replace(/^www\./, ""), rest: unescaped(pathname.replace(/\/$/, "") + search + hash) };
  } catch {
    return undefined;
  }
}

/**
 * `text` with its %-escapes read back into letters, or as it is where they make anything else: a space, a % or a character
 * that doesn't show or turns the text around, none of which would type back to the same address.
 */
function unescaped(text: string): string {
  try {
    const read = decodeURI(text);
    return /[\p{C}\p{Z}%]/u.test(read) ? text : read;
  } catch {
    return text;
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
