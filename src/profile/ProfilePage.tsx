import { Fragment, lazy, Suspense, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ExternalLink } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Office, Profile, ProfileSection } from "@shared/types";
import { SkeletonText } from "@/components/SkeletonText";
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
import { cachedCard } from "@/search/useResults";
import { ShortlistButton } from "@/shortlist/ShortlistButton";
import type { ShortlistCard } from "@/shortlist/store";
import { ContactList, ContactListSkeleton } from "./ContactList";
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

  if (isPending) return <ProfileSkeleton back={back} close={close} />;
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
  const { long, short } = sectionsBySize(profile);
  const hasMatches = matches.length > 0;
  const besideLong = long.length > 0;
  return (
    <article className="@container space-y-8">
      <StickyHeader back={back} close={close} bookmark={<ProfileBookmark profile={profile} />}>
        <Identity
          photo={
            <Avatar className="size-full">
              <AvatarImage src={profile.photoUrl} alt="" />
              <AvatarFallback className="@lg:text-xl">{profile.initials}</AvatarFallback>
            </Avatar>
          }
          name={profile.name}
          location={profile.location}
          contacts={<ContactList profile={profile} />}
        />
      </StickyHeader>

      <Columns
        besideLong={besideLong}
        main={
          (hasMatches || besideLong) && (
            <>
              {hasMatches && (
                <>
                  <SectionView
                    section={{ heading: "Matches your search", paragraphs: [], items: matches, details: [] }}
                    isMatch={isMatch}
                    announce={false}
                  />
                  <Separator />
                </>
              )}
              <Sections sections={long} isMatch={isMatch} />
            </>
          )
        }
        aside={
          (short.length > 0 || profile.offices.length > 0) && (
            <>
              <ShortSections besideLong={besideLong}>
                {short.map((section, i) => (
                  <SectionView key={i} section={section} isMatch={isMatch} />
                ))}
              </ShortSections>
              {profile.offices.length > 0 && (
                <div className={cn("grid gap-8 @xl:grid-cols-2", besideLong && "@4xl:grid-cols-1")}>
                  {profile.offices.map((office, i) => (
                    <OfficeCard key={i} office={office} profile={profile} />
                  ))}
                </div>
              )}
            </>
          )
        }
      />
    </article>
  );
}

/** A profile still loading, laid out as most are: long sections beside short ones. */
function ProfileSkeleton({ back, close }: Exits) {
  return (
    <div aria-busy className="@container space-y-8">
      <StickyHeader back={back} close={close}>
        <div aria-hidden>
          <Identity
            photo={<Skeleton className="size-full rounded-full" />}
            name={<SkeletonText className="w-56" />}
            location={<SkeletonText className="w-16" />}
            contacts={<ContactListSkeleton />}
          />
        </div>
      </StickyHeader>
      <div aria-hidden>
        <Columns
          besideLong
          main={
            <>
              <SectionSkeleton lines={6} />
              <Separator />
              <SectionSkeleton lines={4} />
            </>
          }
          aside={
            <ShortSections besideLong>
              {[4, 1, 3].map((tags, i) => (
                <SectionSkeleton key={i} tags={tags} />
              ))}
            </ShortSections>
          }
        />
      </div>
    </div>
  );
}

// Tags of a skeleton's short sections, which vary in width as tags do.
const TAG_WIDTHS = ["w-20", "w-14", "w-24", "w-16"];

function SectionSkeleton({ lines = 0, tags = 0 }: { lines?: number; tags?: number }) {
  return (
    <Section heading={<SkeletonText className="w-40" />}>
      {lines > 0 && (
        <p>
          <SkeletonText lines={lines} className="w-1/2" />
        </p>
      )}
      {tags > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: tags }, (_, i) => (
            <Badge key={i} variant="secondary" className={cn("animate-pulse", TAG_WIDTHS[i % TAG_WIDTHS.length])} />
          ))}
        </div>
      )}
    </Section>
  );
}

type IdentityProps = { photo: ReactNode; name: ReactNode; location?: ReactNode; contacts: ReactNode };

/** Who the therapist is and how to reach them, laid out for the header of the profile and of its skeleton. */
function Identity({ photo, name, location, contacts }: IdentityProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="size-14 shrink-0 @lg:size-20">{photo}</div>
      <div className="min-w-0 space-y-1.5">
        <div>
          <h1 className="text-2xl leading-tight font-semibold">{name}</h1>
          {location && <p className="text-sm text-muted-foreground">{location}</p>}
        </div>
        {contacts}
      </div>
    </div>
  );
}

/**
 * The profile's columns, shared by the profile and its skeleton. A wide page puts the long sections, under the matches,
 * in a wide column beside the short ones; with no long sections the short ones keep the whole width.
 */
function Columns({ main, aside, besideLong }: { main?: ReactNode; aside?: ReactNode; besideLong: boolean }) {
  return (
    <div className={cn("grid gap-8", besideLong && "@4xl:grid-cols-[minmax(0,1fr)_20rem]")}>
      {main && <div className="space-y-8">{main}</div>}
      {aside && <aside className={cn("space-y-8", besideLong && "@4xl:col-2")}>{aside}</aside>}
    </div>
  );
}

/** Who the profile is and how to reach them, kept in view as the visitor reads on. */
function StickyHeader({ back, close, bookmark, children }: Exits & { bookmark?: ReactNode; children?: ReactNode }) {
  return (
    // A drawer is drawn in the popover colour, which the header matches so text scrolling beneath it stays hidden. The
    // background reaches a little past the content either side, over the rings that cards and focused controls draw
    // outside their boxes; the rule keeps to the content's width.
    <header className="sticky top-0 z-10 -mx-1 bg-background px-1 in-data-[slot=sheet-content]:bg-popover">
      <div className="space-y-2 border-b py-3">
        {back}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">{children}</div>
          {/* Pulls the last icon out to the content's right edge, past the ghost button's padding. */}
          {(bookmark || close) && (
            <div className="-mr-2 flex shrink-0">
              {bookmark}
              {close}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** Shortlists the card the visitor's search showed where there was one, since it says more than the header. */
function ProfileBookmark({ profile }: { profile: Profile }) {
  const client = useQueryClient();
  return <ShortlistButton therapist={cachedCard(client, profile.slug) ?? headerCard(profile)} />;
}

/** The therapist as the header shows them, for a shortlist card until a search that finds them fills it in. */
function headerCard({ slug, name, initials, photoUrl, location }: Profile): ShortlistCard {
  return { slug, name, initials, photoUrl, location, tags: [] };
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

/**
 * Short sections, two to a line once there is room, each under a rule of its own. The first line has none where only a
 * rule or the header is above it: with no long sections, or at the top of a wide page's short column.
 */
function ShortSections({ besideLong, children }: { besideLong: boolean; children: ReactNode[] }) {
  if (children.length === 0) return null;
  const first = besideLong ? "@4xl:first:border-t-0 @4xl:first:pt-0" : "first:border-t-0 first:pt-0 @xl:nth-2:border-t-0 @xl:nth-2:pt-0";
  return (
    <div className={cn("grid gap-8 @xl:grid-cols-2", besideLong && "@4xl:grid-cols-1")}>
      {children.map((section, i) => (
        <div key={i} className={cn("border-t pt-8", first)}>
          {section}
        </div>
      ))}
    </div>
  );
}

// A badge keeps to one line at a fixed height, and a tag as long as a college's name runs past a narrow column, so these
// wrap; the thinner padding keeps a one-line tag at the badge's height.
const TAG = "h-auto py-px whitespace-normal";

/** A section's heading above what it says, laid out for the profile and its skeleton. */
function Section({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

function SectionView({ section, isMatch, announce = true }: SectionProps) {
  return (
    <Section heading={section.heading}>
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
    </Section>
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
        {office.cost && (
          <div>
            <h3 className="font-medium">Fees</h3>
            <p className="whitespace-pre-line">{office.cost}</p>
          </div>
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
