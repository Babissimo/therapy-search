import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, ExternalLink, Globe, Mail, Phone, type LucideIcon } from "lucide-react";
import { ukcpProfileUrl } from "@shared/query";
import type { Profile } from "@shared/types";
import { ErrorLine } from "@/components/ErrorLine";
import { SkeletonText } from "@/components/SkeletonText";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** `title` gives the whole of a text that is shortened or may be cut off. */
type Item = { icon: LucideIcon; kind?: string; text: string; title?: string; href: string; external?: boolean };

/** Every way to reach the therapist, each marked by an icon. UKCP gives phone and website only on request, made as the profile opens. */
export function ContactList({ profile }: { profile: Profile }) {
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
  if (phone) items.push({ icon: Phone, kind: "Telephone", text: phone, href: `tel:${phone.replace(/\s/g, "")}` });
  if (email) items.push({ icon: Mail, kind: "Email", text: email, title: email, href: `mailto:${email}` });
  if (website) items.push({ icon: Globe, kind: "Website", text: shortUrl(website), title: website, href: website, external: true });
  for (const url of profile.social) if (url !== website) items.push({ icon: AtSign, text: socialName(url), title: url, href: url, external: true });
  items.push({ icon: ExternalLink, text: "View on UKCP", href: ukcpProfileUrl(profile.slug), external: true });

  return (
    <div className="space-y-1">
      <ContactRow>
        {items.map((item) => (
          <li key={item.href} className="shrink-0 @lg:max-w-full @lg:min-w-0 @lg:shrink">
            <a
              href={item.href}
              title={item.title}
              aria-label={item.kind && `${item.kind}: ${item.text}`}
              className="inline-flex max-w-full items-center gap-1.5 hover:underline"
              {...(item.external && { target: "_blank", rel: "noreferrer" })}
            >
              <item.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{item.text}</span>
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
        <ErrorLine>
          {contact.error.message}{" "}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => contact.refetch()}>
            Try again
          </Button>
        </ErrorLine>
      )}
    </div>
  );
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

/** One row that scrolls sideways where the header is narrow, so the header stays short enough to keep in view. */
function ContactRow({ children }: { children: ReactNode }) {
  return (
    <ul className="flex gap-x-4 gap-y-1 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none] @lg:flex-wrap @lg:overflow-visible">
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
