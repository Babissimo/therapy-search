import { Fragment, lazy, useEffect, type ReactNode, type Ref } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Diamond, ExternalLink, MapPin } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Office, Profile, ProfileSection } from "@shared/types";
import { FailedAlert, useFailure } from "@/components/FailedAlert";
import { MapSlot } from "@/components/MapSlot";
import { Portrait } from "@/components/Portrait";
import { SkeletonText } from "@/components/SkeletonText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useStuck } from "@/lib/useStuck";
import { useTitle } from "@/lib/useTitle";
import { cn } from "@/lib/utils";
import { cachedCard } from "@/search/useResults";
import { ShortlistButton } from "@/shortlist/ShortlistButton";
import type { ShortlistCard } from "@/shortlist/store";
import { ContactList, ContactListSkeleton } from "./ContactList";
import { isInterestOf, type ShownSection } from "./interests";
import { nearestOffice } from "./nearestOffice";
import { useOfficePlace } from "./place";
import { sectionsBySize } from "./sectionsBySize";
import { matchingTags, useOpeningCard, useSearchMatch } from "./searchedTerms";

const ProfileMap = lazy(() => import("./ProfileMap"));

/** A therapist's profile, read from UKCP once for the page or drawer that shows it and whatever names that. */
export function profileQuery(slug: string) {
  return queryOptions({ queryKey: ["profile", slug], queryFn: () => api.profile(slug) });
}

/** A profile as a page of its own, for a visitor who followed a link to it. */
export function ProfilePage({ slug }: { slug: string }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);
  useTitle(useQuery(profileQuery(slug)).data?.name);
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
  const query = useQuery(profileQuery(slug));
  const failure = useFailure(query, slug);
  const isMatch = useSearchMatch();
  const card = useOpeningCard(slug);

  if (failure.error) {
    return (
      <div className="space-y-4">
        <StickyHeader back={back} close={close} />
        <FailedAlert error={failure.error} retrying={failure.retrying} onRetry={failure.retry} />
      </div>
    );
  }
  const profile = query.data;
  if (profile === undefined) return <ProfileSkeleton back={back} close={close} />;

  const matches = matchingTags(profile, isMatch);
  const { long, short } = sectionsBySize(profile);
  const hasMatches = matches.length > 0;
  const besideLong = long.length > 0;
  const nearest = nearestOffice(profile.offices, card);
  const offices = nearest === undefined ? profile.offices : [profile.offices[nearest]!, ...profile.offices.toSpliced(nearest, 1)];
  return (
    <article className={BODY}>
      <StickyHeader back={back} close={close} bookmark={<ProfileBookmark profile={profile} />}>
        <Identity
          photo={
            <Portrait
              photoUrl={profile.photoUrl}
              initials={profile.initials}
              className="size-full"
              initialsClassName="text-[length:max(1.25rem,32cqi)]"
            />
          }
          name={profile.name}
          headingRef={failure.landing}
          location={
            profile.location && (
              <span className="flex gap-1.5">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                {profile.location}
              </span>
            )
          }
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
                    isInterest={isInterestOf(profile)}
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
              {offices.length > 0 && (
                <div className={cn("grid gap-8 @xl:grid-cols-2", besideLong && "@4xl:grid-cols-1")}>
                  {offices.map((office, i) => (
                    <OfficeCard key={i} office={office} profile={profile} distance={nearest !== undefined && i === 0 ? card?.distance : undefined} />
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

// Lest a sticking header's shrink take back the scroll that stuck it: no scroll anchors, and a foot as tall as its largest shrink.
const BODY = "@container space-y-8 [overflow-anchor:none] has-data-stuck:pb-12";

/** A profile still loading, laid out as most are: long sections beside short ones. */
function ProfileSkeleton({ back, close }: Exits) {
  return (
    <div aria-busy className={BODY}>
      <StickyHeader back={back} close={close}>
        <div aria-hidden>
          <Identity
            photo={<Skeleton className="size-full rounded-md" />}
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
        <p className={READING}>
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

type IdentityProps = { photo: ReactNode; name: ReactNode; location?: ReactNode; contacts: ReactNode; headingRef?: Ref<HTMLHeadingElement> };

/** Who the therapist is and how to reach them, laid out for the header of the profile and of its skeleton. */
function Identity({ photo, name, location, contacts, headingRef }: IdentityProps) {
  return (
    <div className="flex items-start gap-4">
      {/* Large for a first look, as far as UKCP's 200 px photos allow, then no taller than the text beside it once the header
          sticks, shrinking by no more than BODY's foot. A container, which the initials size to. */}
      <div
        className={cn(
          "@container size-24 shrink-0 @lg:size-32 group-data-stuck/header:size-14 @lg:group-data-stuck/header:size-20",
          "motion-safe:transition-[width,height] motion-safe:duration-200",
        )}
      >
        {photo}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div>
          {/* Focused only by the page, when what held the keyboard goes. */}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="rounded-sm font-heading text-2xl leading-tight font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 @lg:text-3xl"
          >
            {name}
          </h1>
          {location && <p className="text-sm text-muted-foreground">{location}</p>}
        </div>
        {contacts}
      </div>
    </div>
  );
}

/**
 * The profile's columns, shared by the profile and its skeleton. A wide page puts the long sections, under the matches,
 * in a column as wide as their reading measure, with the short ones at the far side; with no long sections the short
 * ones keep the whole width.
 */
function Columns({ main, aside, besideLong }: { main?: ReactNode; aside?: ReactNode; besideLong: boolean }) {
  return (
    <div className={cn("grid gap-8", besideLong && "@4xl:grid-cols-[minmax(0,var(--container-reading))_20rem] @4xl:justify-between")}>
      {main && <div className="space-y-8">{main}</div>}
      {aside && <aside className={cn("space-y-8", besideLong && "@4xl:col-2")}>{aside}</aside>}
    </div>
  );
}

/** Who the profile is and how to reach them, kept in view as the visitor reads on. */
function StickyHeader({ back, close, bookmark, children }: Exits & { bookmark?: ReactNode; children?: ReactNode }) {
  const [ref, stuck] = useStuck();
  return (
    // A drawer is drawn in the popover colour, which the header matches so text scrolling beneath it stays hidden. The
    // background reaches a little past the content either side, over the rings that cards and focused controls draw
    // outside their boxes; the rule keeps to the content's width. It sticks a pixel high, for `useStuck` to see it clipped.
    <header
      ref={ref}
      data-stuck={stuck || undefined}
      className="group/header sticky -top-px z-10 -mx-1 bg-background px-1 in-data-[slot=sheet-content]:bg-popover"
    >
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

type TagProps = {
  isMatch: (tag: string) => boolean;
  /** Marks the tags that are special interests, where no heading already says so. */
  isInterest?: (tag: string) => boolean;
  /** Tells screen readers which tags match, where the heading doesn't already say so. */
  announce?: boolean;
};

type SectionProps = TagProps & { section: ShownSection };

/** Sections one after another, with a rule between each. */
function Sections({ sections, isMatch }: { sections: ShownSection[]; isMatch: SectionProps["isMatch"] }) {
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

// Therapists write at length about themselves, and visitors read it closely, so it is set for reading.
const READING = "max-w-reading text-[1.0625rem] leading-relaxed";

/** A section's heading above what it says, laid out for the profile and its skeleton. */
function Section({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="eyebrow text-primary">{heading}</h2>
      {children}
    </section>
  );
}

function SectionView({ section, ...tags }: SectionProps) {
  const { interests } = section;
  const hasInterests = interests !== undefined && interests.paragraphs.length + interests.details.length > 0;
  return (
    <Section heading={section.heading}>
      <Paragraphs paragraphs={section.paragraphs} />
      {hasInterests ? (
        <div className="space-y-6">
          <Group heading={<><InterestMark />Special interests</>}>
            <Paragraphs paragraphs={interests.paragraphs} />
            <Details details={interests.details} {...tags} />
          </Group>
          {section.items.length > 0 && (
            <Group heading="Other areas">
              <Tags tags={section.items} {...tags} />
            </Group>
          )}
        </div>
      ) : (
        section.items.length > 0 && <Tags tags={section.items} {...tags} />
      )}
      {section.details.length > 0 && <Details details={section.details} {...tags} />}
    </Section>
  );
}

function Paragraphs({ paragraphs }: { paragraphs: string[] }) {
  return paragraphs.map((text, i) => (
    <p key={i} className={cn(READING, "whitespace-pre-line")}>
      {text}
    </p>
  ));
}

/** A part of a section under a heading of its own. */
function Group({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">{heading}</h3>
      {children}
    </div>
  );
}

/** Marks a special interest, beside its group's heading and among the matches. A diamond, since a star echoes UKCP's branding. */
function InterestMark(props: { "data-icon"?: string }) {
  // A badge sizes its icons to size-3, so the heading's matches it.
  return <Diamond aria-hidden fill="currentColor" className="size-3 shrink-0" {...props} />;
}

/** Each tag above what the therapist wrote of it, then the tags they wrote nothing of on one line. */
function Details({ details, ...tags }: TagProps & { details: ProfileSection["details"] }) {
  const written = details.filter((detail) => detail.text);
  const bare = details.filter((detail) => !detail.text).map((detail) => detail.title);
  return (
    <div className="space-y-4">
      {written.length > 0 && (
        <dl className="space-y-4">
          {written.map((detail, i) => (
            <div key={i} className="space-y-1.5">
              <dt>
                <Tag tag={detail.title} {...tags} />
              </dt>
              <dd className={cn(READING, "whitespace-pre-line")}>{detail.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {bare.length > 0 && <Tags tags={bare} {...tags} />}
    </div>
  );
}

function Tags({ tags, ...props }: TagProps & { tags: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag, i) => (
        <li key={i}>
          <Tag tag={tag} {...props} />
        </li>
      ))}
    </ul>
  );
}

function Tag({ tag, isMatch, isInterest, announce = true }: TagProps & { tag: string }) {
  const interest = isInterest?.(tag) && (
    <>
      <InterestMark data-icon="inline-end" />
      <span className="sr-only">, a special interest</span>
    </>
  );
  if (!isMatch(tag)) {
    return (
      <Badge variant="secondary" className={TAG}>
        {tag}
        {interest}
      </Badge>
    );
  }
  return (
    <Badge className={TAG}>
      <Check data-icon="inline-start" aria-hidden />
      {tag}
      {announce && <span className="sr-only">, in your search</span>}
      {interest}
    </Badge>
  );
}

/** An office's card; the one nearest the visitor's search is marked as a matching tag is, with the distance its search card gave. */
function OfficeCard({ office, profile, distance }: { office: Office; profile: Profile; distance?: string }) {
  return (
    <Card className={cn(distance && "ring-primary")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
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
          {distance && (
            <Badge>
              <Check data-icon="inline-start" aria-hidden />
              {distance}
              <span className="sr-only">, the office nearest your search</span>
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 text-sm">
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
        {/* The map takes the card's foot, so maps in a row of cards line up. */}
        <OfficeMap office={office} profile={profile} />
      </CardContent>
    </Card>
  );
}

/** A small map around the office, once it is placed; Leaflet loads only then. */
function OfficeMap({ office, profile }: { office: Office; profile: Profile }) {
  const place = useOfficePlace(office, profile.location);
  if (!place) return null;
  return (
    <div role="region" aria-label={`Map of ${office.name || "the office"}`} className="isolate mt-auto h-40 overflow-hidden rounded-lg border">
      <MapSlot>
        {/* Leaflet takes its centre only once, so a new place makes a new map. */}
        <ProfileMap key={`${place.point.lat},${place.point.lng}`} profile={profile} point={place.point} zoom={place.zoom} />
      </MapSlot>
    </div>
  );
}
