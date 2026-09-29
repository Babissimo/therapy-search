import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Office, ProfileSection } from "@shared/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ContactList } from "./ContactList";
import { matchingTags, useSearchMatch } from "./searchedTerms";

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
  const languages: ProfileSection = { heading: "Languages", paragraphs: [], items: profile.languages, details: [] };
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

      {(matches.length > 0 || priced.length > 0) && (
        <div className="grid gap-4 @2xl:grid-cols-2">
          {matches.length > 0 && (
            <SectionView section={{ heading: "Matches your search", paragraphs: [], items: matches, details: [] }} isMatch={isMatch} announce={false} />
          )}
          {priced.length > 0 && <Fees offices={priced} />}
        </div>
      )}

      <div className="grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          {profile.about.map((section, i) => (
            <SectionView key={i} section={section} isMatch={isMatch} />
          ))}
        </div>
        <aside className="space-y-6">
          {profile.languages.length > 0 && <SectionView section={languages} isMatch={isMatch} />}
          {profile.practical.map((section, i) => (
            <SectionView key={i} section={section} isMatch={isMatch} />
          ))}
          {profile.offices.map((office, i) => (
            <OfficeCard key={i} office={office} />
          ))}
        </aside>
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

function SectionView({ section, isMatch, announce = true }: SectionProps) {
  return (
    <section className="space-y-3">
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
                <Badge>
                  <Check data-icon="inline-start" aria-hidden />
                  {item}
                  {announce && <span className="sr-only">, in your search</span>}
                </Badge>
              ) : (
                <Badge variant="secondary">{item}</Badge>
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
function Fees({ offices }: { offices: Office[] }) {
  const alike = new Set(offices.map((office) => office.cost)).size === 1;
  return (
    <section className="space-y-3">
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

function OfficeCard({ office }: { office: Office }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {office.name}
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
        {office.mapUrl && (
          <a className="underline" href={office.mapUrl} target="_blank" rel="noreferrer">
            View map
          </a>
        )}
      </CardContent>
    </Card>
  );
}
