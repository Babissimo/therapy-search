import { Fragment, lazy, Suspense, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ExternalLink } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Office, Profile, ProfileSection } from "@shared/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ContactList } from "./ContactList";
import { useOfficePlace } from "./place";
import { sectionsBySize } from "./sectionsBySize";
import { matchingTags, useSearchMatch } from "./searchedTerms";

const ProfileMap = lazy(() => import("./ProfileMap"));

/** A profile as a page of its own, for a visitor who followed a link to it. */
export function ProfilePage({ slug }: { slug: string }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);
  return <ProfileBody slug={slug} back={<BackButton />} />;
}

/** Back to wherever the visitor came from, usually their search, or to a new search when they arrived here directly. */
function BackButton() {
  const navigate = useNavigate();
  const { key } = useLocation();
  // Pulls the chevron out to the content's left edge, past the ghost button's padding.
  const className = "-ml-2.5";
  // React Router keys the first page of a visit "default": there is nothing in the app to go back to.
  if (key === "default") {
    return (
      <Button variant="ghost" className={className} asChild>
        <Link to="/">
          <ChevronLeft aria-hidden />
          Search for a therapist
        </Link>
      </Button>
    );
  }
  return (
    <Button variant="ghost" className={className} onClick={() => navigate(-1)}>
      <ChevronLeft aria-hidden />
      Back to results
    </Button>
  );
}

/** The ways out of a profile: a page's goes above it, a drawer's closes it from the corner. */
type Exits = { back?: ReactNode; close?: ReactNode };

/** A therapist's profile, laid out by the width it is given, whether a page's or a drawer's. */
export function ProfileBody({ slug, back, close }: { slug: string } & Exits) {
  const { data: profile, error, isPending } = useQuery({ queryKey: ["profile", slug], queryFn: () => api.profile(slug) });
  const isMatch = useSearchMatch();

  if (isPending) {
    return (
      <div className="space-y-4">
        <StickyHeader back={back} close={close} />
        <Skeleton className="h-64 w-full rounded-xl" aria-busy />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <StickyHeader back={back} close={close} />
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const matches = matchingTags(profile, isMatch);
  const priced = profile.offices.filter((office) => office.cost);
  const { long, short } = sectionsBySize(profile);
  const hasMatches = matches.length > 0;
  const hasFees = priced.length > 0;
  // A wide page puts the long sections, under the matches, in a wide column beside the short ones, under the fees; a
  // column without its head starts at the top. With no long sections the short ones keep the whole width.
  const besideLong = long.length > 0;
  const below = (headed: boolean) => (headed ? "@4xl:row-2" : "@4xl:row-[1/span_2]");
  return (
    <article className="@container space-y-8">
      <StickyHeader back={back} close={close}>
        <div className="flex items-start gap-4">
          <Avatar className="size-14 shrink-0 @lg:size-20">
            <AvatarImage src={profile.photoUrl} alt="" />
            <AvatarFallback className="@lg:text-xl">{profile.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5">
            <div>
              <h1 className="text-2xl leading-tight font-semibold">{profile.name}</h1>
              {profile.location && <p className="text-sm text-muted-foreground">{profile.location}</p>}
            </div>
            <ContactList profile={profile} />
          </div>
        </div>
      </StickyHeader>

      <div className={cn("grid gap-8 @xl:grid-cols-2", besideLong && "@4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:grid-rows-[auto_1fr]")}>
        {hasMatches && (
          <SectionView
            section={{ heading: "Matches your search", paragraphs: [], items: matches, details: [] }}
            isMatch={isMatch}
            announce={false}
            className={cn(besideLong && "@4xl:col-1 @4xl:row-1")}
          />
        )}
        {hasMatches && hasFees && <Separator className="@xl:hidden" />}
        {hasFees && <Fees offices={priced} className={cn(besideLong && "@4xl:col-2 @4xl:row-1")} />}
        {(hasMatches || hasFees) && <Separator className={cn("@xl:col-span-2", besideLong && "@4xl:hidden")} />}
        {besideLong && (
          <div className={cn("space-y-8 @xl:col-span-2 @4xl:col-1", below(hasMatches))}>
            {/* In its own column the rule under the matches spans only that column. */}
            {hasMatches && <Separator className="hidden @4xl:block" />}
            <Sections sections={long} isMatch={isMatch} />
          </div>
        )}
        {(short.length > 0 || profile.offices.length > 0) && (
          <aside className={cn("space-y-8 @xl:col-span-2", besideLong && ["@4xl:col-2", below(hasFees)])}>
            <ShortSections sections={short} isMatch={isMatch} besideLong={besideLong} underFees={hasFees} />
            {profile.offices.length > 0 && (
              <div className={cn("grid gap-8 @xl:grid-cols-2", besideLong && "@4xl:grid-cols-1")}>
                {profile.offices.map((office, i) => (
                  <OfficeCard key={i} office={office} profile={profile} />
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </article>
  );
}

/** Who the profile is and how to reach them, kept in view as the visitor reads on. */
function StickyHeader({ back, close, children }: Exits & { children?: ReactNode }) {
  return (
    // A drawer is drawn in the popover colour, which the header matches so text scrolling beneath it stays hidden.
    <header className="sticky top-0 z-10 space-y-2 border-b bg-background py-3 in-data-[slot=sheet-content]:bg-popover">
      {back}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">{children}</div>
        {close}
      </div>
    </header>
  );
}

type SectionProps = {
  section: ProfileSection;
  isMatch: (tag: string) => boolean;
  /** Tells screen readers which tags match, where the heading doesn't already say so. */
  announce?: boolean;
};

/** Sections one after another, with a rule between each. */
function Sections({ sections, isMatch }: { sections: ProfileSection[]; isMatch: SectionProps["isMatch"] }) {
  return sections.map((section, i) => (
    <Fragment key={i}>
      {i > 0 && <Separator />}
      <SectionView section={section} isMatch={isMatch} />
    </Fragment>
  ));
}

type ShortProps = { sections: ProfileSection[]; isMatch: SectionProps["isMatch"]; besideLong: boolean; underFees: boolean };

/**
 * Short sections, two to a line once there is room, each under a rule of its own. The first line has none where only a
 * rule or the header is above it: with no long sections, or at the top of a wide page's short column without fees.
 */
function ShortSections({ sections, isMatch, besideLong, underFees }: ShortProps) {
  if (sections.length === 0) return null;
  const first = !besideLong
    ? "first:border-t-0 first:pt-0 @xl:nth-2:border-t-0 @xl:nth-2:pt-0"
    : underFees
      ? ""
      : "@4xl:first:border-t-0 @4xl:first:pt-0";
  return (
    <div className={cn("grid gap-8 @xl:grid-cols-2", besideLong && "@4xl:grid-cols-1")}>
      {sections.map((section, i) => (
        <SectionView key={i} section={section} isMatch={isMatch} className={cn("border-t pt-8", first)} />
      ))}
    </div>
  );
}

// A badge keeps to one line at a fixed height, and a tag as long as a college's name runs past a narrow column, so these
// wrap; the thinner padding keeps a one-line tag at the badge's height.
const TAG = "h-auto py-px whitespace-normal";

function SectionView({ section, isMatch, announce = true, className }: SectionProps & { className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="text-lg font-semibold">{section.heading}</h2>
      {section.paragraphs.map((text, i) => (
        <p key={i} className="whitespace-pre-line">
          {text}
        </p>
      ))}
      {section.items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {section.items.map((item, i) => (
            <li key={i}>
              {isMatch(item) ? (
                <Badge className={TAG}>
                  <Check data-icon="inline-start" aria-hidden />
                  {item}
                  {announce && <span className="sr-only">, in your search</span>}
                </Badge>
              ) : (
                <Badge variant="secondary" className={TAG}>{item}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {section.details.length > 0 && (
        <Accordion type="multiple">
          {section.details.map((detail, i) => (
            <AccordionItem key={i} value={String(i)}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  {isMatch(detail.title) && <Check aria-hidden className="size-4 shrink-0" />}
                  {detail.title}
                  {announce && isMatch(detail.title) && <span className="sr-only">, in your search</span>}
                </span>
              </AccordionTrigger>
              <AccordionContent className="whitespace-pre-line">{detail.text}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  );
}

/** The fees of the offices that give them, named by office only where they differ. */
function Fees({ offices, className }: { offices: Office[]; className?: string }) {
  const alike = new Set(offices.map((office) => office.cost)).size === 1;
  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="text-lg font-semibold">Fees</h2>
      {alike ? (
        <p className="whitespace-pre-line">{offices[0]?.cost}</p>
      ) : (
        <dl className="space-y-3">
          {offices.map((office, i) => (
            <div key={i}>
              <dt className="font-medium">{office.name}</dt>
              <dd className="whitespace-pre-line">{office.cost}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function OfficeCard({ office, profile }: { office: Office; profile: Profile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {office.mapUrl ? (
            <a className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline" href={office.mapUrl} target="_blank" rel="noreferrer">
              {office.name}
              <ExternalLink aria-hidden className="size-4 text-muted-foreground" />
              <span className="sr-only">, map</span>
            </a>
          ) : (
            office.name
          )}
          {office.isMain && <Badge variant="outline">Main address</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {office.address.length > 0 && (
          <address className="not-italic">
            {office.address.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </address>
        )}
        <OfficeMap office={office} profile={profile} />
      </CardContent>
    </Card>
  );
}

/** A small map around the office, once it is placed; Leaflet loads only then. */
function OfficeMap({ office, profile }: { office: Office; profile: Profile }) {
  const place = useOfficePlace(office, profile.location);
  if (!place) return null;
  const fallback = <div className="size-full bg-muted" />;
  return (
    <div role="region" aria-label={`Map of ${office.name || "the office"}`} className="isolate h-40 overflow-hidden rounded-lg border">
      <Suspense fallback={fallback}>
        {/* Leaflet takes its centre only once, so a new place makes a new map. */}
        <ProfileMap key={`${place.point.lat},${place.point.lng}`} profile={profile} point={place.point} zoom={place.zoom} />
      </Suspense>
    </div>
  );
}
