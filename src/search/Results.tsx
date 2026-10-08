import { MapPin } from "lucide-react";
import { useId, type ComponentProps, type ReactNode, type Ref } from "react";
import type { SearchParams } from "@shared/query";
import type { TherapistCard as Therapist } from "@shared/types";
import { SkeletonText } from "@/components/SkeletonText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ShortlistButton } from "@/shortlist/ShortlistButton";
import { useShortlistStatus } from "@/shortlist/useShortlist";
import { activeFilters, soughtTerms } from "./activeFilters";
import { feeKinds, feeLine, type Fee } from "./fee";
import { LocationNotice } from "./LocationNotice";
import { listEntries, pinLabel, type Pin } from "./map/pins";
import { resultsHeading } from "./reach";
import { ResultsError } from "./ResultsError";
import { useSlowLine } from "./ResultsStatus";
import { TherapistCard, TherapistCardSkeleton } from "./TherapistCard";
import { useOffices } from "./useOffices";
import type { SearchResults } from "./useResults";

type Props = {
  params: SearchParams;
  results: SearchResults;
  /** The list of cards, for "Load more" to hand the keyboard on to. */
  listRef?: Ref<HTMLUListElement>;
  pins?: Pin[];
  unplaced?: Therapist[];
  /** The pin last activated on the map, whose place in the list is marked. */
  selected?: Pin;
  /** The therapist whose card the pointer or focus is on, for the map to ring their pin. */
  onHighlight?: (slug: string | undefined) => void;
  /** Among therapists met online or by phone, with no place to show. */
  online?: boolean;
  /** The search as the visitor set it, where `params` adds to it, whose filters paper names. */
  asked?: SearchParams;
};

// UKCP's notices about its own pages, which don't hold for this list: that it lists a location search at random, when
// this list is nearest first, and that a search without a place finds more than 24, when Load more reaches them all.
const UKCP_PAGING = /^(Location searches are grouped by distance|This search returns more than \d+ results)/;

/** A search's list. Its ResultsStatus goes outside it, as the list is marked busy and dimmed while it loads. */
export function Results({ params, results, listRef, pins = [], unplaced = [], selected, onHighlight, online = false, asked = params }: Props) {
  const { first, therapists, searchedPlace, loading, stale, failure } = results;
  const { officeOf } = useOffices(therapists, !params.flags.LocationSearchOutsideUK);
  // Kept from screen readers, which the status region tells.
  const slow = useSlowLine(params, results);
  const slowNote = slow && (
    <p aria-hidden className="mb-4 text-sm text-muted-foreground">
      {slow}
    </p>
  );
  if (failure.error) {
    return <ResultsError error={failure.error} params={params} retrying={failure.retrying} onRetry={failure.retry} />;
  }
  if (loading) {
    return (
      <div className="space-y-4" aria-busy>
        {slowNote}
        <div aria-hidden>
          {/* Online, the heading stands alone. Near a place, the note says how the list is ordered as well as what its pins
              show, which takes two lines. */}
          <Summary
            title={<SkeletonText className="w-48" />}
            sub={!online && <SkeletonText className="w-56" />}
            note={!online && <SkeletonText lines={2} className="w-1/2" />}
          />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <TherapistCardSkeleton key={i} online={online} />
        ))}
      </div>
    );
  }

  const count = first?.total;
  const located = searchedPlace !== undefined;
  const highlight = (slug: string) => (on: boolean) => onHighlight?.(on ? slug : undefined);
  const sought = soughtTerms(params);
  const filters = activeFilters(asked);
  const wanted = feeKinds(params.multi.WorksWith);
  const feeOf = (t: Therapist) => {
    const office = officeOf(t);
    return office && feeLine(office.cost, wanted);
  };

  return (
    <>
      {slowNote}
      {/* Dims while the next search's results are on their way. */}
      <section aria-busy={stale} className={cn("space-y-4 motion-safe:transition-opacity", stale && "opacity-60")}>
        {/* The heading and each entry fade in as they replace their skeleton or arrive, and again as their tab is shown,
            which starts their animations afresh. Side by side rather than one within another, so no fade dims another. */}
        <div className="space-y-4 fade-in-0 motion-safe:animate-in">
          {/* With no one found, the heading has said so, and the place still says where. Online, the heading stands alone. Paper,
              without the chips or Load more, names the filters and says how many there are, in lines boxed with the heading, as
              hidden on screen they would still count among space-y's children. */}
          <div>
            <Summary
              headingRef={failure.landing}
              title={resultsHeading(therapists, count, located)}
              sub={searchedPlace ? <span translate="no">{searchedPlace}</span> : !online && therapists.length > 0 && `${therapists.length} of ${count}`}
              note={!online && therapists.length > 0 && listNote(located, unplaced.length)}
            />
            {online && (
              <p className="mt-1 hidden text-sm print:block">
                Working online or by phone{count !== undefined && therapists.length < count && `: the first ${therapists.length} of ${count}`}.
              </p>
            )}
            {filters.length > 0 && <p className="mt-1 hidden text-sm print:block">Filters: {filters.map((filter) => filter.label).join(", ")}</p>}
          </div>
          <LocationNotice typed={params.text.Location} searched={first?.locationSearched} />
          {first?.notices.filter((notice) => !UKCP_PAGING.test(notice)).map((notice) => (
            <Alert key={notice}>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ))}
        </div>
        <ul ref={listRef} className="space-y-4">
          {listEntries(therapists, pins).map((entry) => {
            const { key, pin, therapist: t } = entry;
            const marked = pin !== undefined && pin.key === selected?.key;
            return (
              // Marked by pin, so the page can bring a selected pin's entry into view.
              <li
                key={key}
                data-pin={pin?.key}
                aria-current={marked || undefined}
                className={cn("rounded-xl fade-in-0 motion-safe:animate-in", marked && t && "ring-2 ring-highlight forced-marked")}
              >
                {t ? (
                  <ResultCard therapist={t} sought={sought} online={online} fee={feeOf(t)} onHighlight={highlight(t.slug)} />
                ) : (
                  <PinGroup pin={entry.pin} marked={marked} sought={sought} feeOf={feeOf} highlight={highlight} />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** A result's card with its bookmark, saying where the visitor stands with them once shortlisted. */
function ResultCard(props: Omit<ComponentProps<typeof TherapistCard>, "action" | "status">) {
  const status = useShortlistStatus(props.therapist.slug);
  return <TherapistCard {...props} action={<ShortlistButton therapist={props.therapist} />} status={status} />;
}

/** The list's heading and the lines under it, shared by the list and its skeleton. */
function Summary({ title, sub, note, headingRef }: { title: ReactNode; sub?: ReactNode; note?: ReactNode; headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <div className="space-y-1">
      {/* Focused only by the page, when what held the keyboard goes. */}
      <h2 ref={headingRef} tabIndex={-1} className="rounded-sm font-heading text-xl font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {title}
      </h2>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** How the list is ordered and what its pins show, which paper, having no map, leaves out. UKCP measures each distance to the therapist's address. */
function listNote(located: boolean, unplaced: number): ReactNode {
  return (
    <>
      {located && "Nearest first, measured from the centre of the place searched. "}
      <span className="print:hidden">Pins show the postcode or area each therapist lists{unplaced > 0 && ` · ${unplaced} not on the map`}.</span>
    </>
  );
}

type PinGroupProps = {
  pin: Pin;
  marked: boolean;
  sought: ReadonlySet<string>;
  feeOf: (t: Therapist) => Fee | undefined;
  highlight: (slug: string) => (on: boolean) => void;
};

/** Everyone at a stacked pin, under the place they list. */
function PinGroup({ pin, marked, sought, feeOf, highlight }: PinGroupProps) {
  const headingId = useId();
  return (
    // A group rather than a section, which would make every place a landmark.
    <div
      role="group"
      aria-labelledby={headingId}
      className={cn("space-y-3 rounded-xl border p-3 transition-colors", marked && "border-highlight bg-highlight/10 ring-1 ring-highlight forced-marked")}
    >
      <h2 id={headingId} className="eyebrow flex items-start gap-1.5 text-primary">
        <MapPin aria-hidden className={cn("size-4 shrink-0", marked ? "text-highlight" : "text-muted-foreground")} />
        {/* One box beside the pin, so a long place wraps with the count after it. The space parts the two in the group's
            name; the dot does so on screen, where spaced capitals run together. */}
        <span className="min-w-0">
          <span translate="no">{pinLabel(pin)}</span> <span aria-hidden>·</span>{" "}
          <span className="font-normal text-muted-foreground">{pin.therapists.length} therapists</span>
        </span>
      </h2>
      <ul className="space-y-3">
        {pin.therapists.map((t) => (
          <li key={t.slug}>
            <ResultCard therapist={t} sought={sought} grouped fee={feeOf(t)} onHighlight={highlight(t.slug)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
