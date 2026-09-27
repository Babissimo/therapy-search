import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { ukcpProfileUrl } from "@shared/query";
import type { Office, ProfileSection } from "@shared/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ContactReveal } from "./ContactReveal";

export function ProfilePage({ slug }: { slug: string }) {
  return (
    <div className="space-y-4">
      <BackButton />
      <ProfileBody slug={slug} />
    </div>
  );
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

function ProfileBody({ slug }: { slug: string }) {
  const { data: profile, error, isPending } = useQuery({ queryKey: ["profile", slug], queryFn: () => api.profile(slug) });
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  if (isPending) return <Skeleton className="h-64 w-full rounded-xl" aria-busy />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <article className="space-y-8">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <Avatar className="size-28 shrink-0">
          <AvatarImage src={profile.photoUrl} alt="" />
          <AvatarFallback className="text-2xl">{profile.initials}</AvatarFallback>
        </Avatar>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold">{profile.name}</h1>
          {profile.location && <p className="text-muted-foreground">{profile.location}</p>}
          <div className="flex flex-wrap gap-2">
            {profile.email && (
              <Button asChild>
                <a href={`mailto:${profile.email}`}>Email therapist</a>
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={ukcpProfileUrl(profile.slug)} target="_blank" rel="noreferrer">
                View on UKCP
              </a>
            </Button>
          </div>
          {profile.contactId && <ContactReveal id={profile.contactId} />}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          {profile.about.map((section, i) => (
            <SectionView key={i} section={section} />
          ))}
        </div>
        <aside className="space-y-6">
          {profile.practical.map((section, i) => (
            <SectionView key={i} section={section} />
          ))}
          {profile.offices.map((office, i) => (
            <OfficeCard key={i} office={office} />
          ))}
        </aside>
      </div>
    </article>
  );
}

function SectionView({ section }: { section: ProfileSection }) {
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
              <Badge variant="secondary">{item}</Badge>
            </li>
          ))}
        </ul>
      )}
      {section.details.length > 0 && (
        <Accordion type="multiple">
          {section.details.map((detail, i) => (
            <AccordionItem key={i} value={String(i)}>
              <AccordionTrigger>{detail.title}</AccordionTrigger>
              <AccordionContent className="whitespace-pre-line">{detail.text}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
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
        {office.cost && (
          <div>
            <h3 className="font-medium">Cost</h3>
            <p className="whitespace-pre-line">{office.cost}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
