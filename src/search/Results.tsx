import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PAGE_SIZE, toQuery, ukcpSearchUrl, type SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { orderSeed } from "./orderSeed";
import { ResultsPagination } from "./ResultsPagination";
import { withPage } from "./state";
import { TherapistCard } from "./TherapistCard";

type Props = { params: SearchParams; onChange: (next: SearchParams) => void };

export function Results({ params, onChange }: Props) {
  const [seed] = useState(() => orderSeed());
  const query = toQuery({ ...params, orderSeed: seed }, { withSeed: true });
  const { data, error, isPending, isPlaceholderData } = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.search(query),
    placeholderData: keepPreviousData,
  });

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error.message}{" "}
          <a className="underline" href={ukcpSearchUrl(params)}>
            Search on UKCP
          </a>
        </AlertDescription>
      </Alert>
    );
  }

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  return (
    <section aria-busy={isPlaceholderData} className={cn("space-y-4", isPlaceholderData && "opacity-60")}>
      <p className="text-sm text-muted-foreground">{data.total > 0 ? `${data.from}-${data.to} of ${data.total} results` : "No results"}</p>
      {data.locationSearched && (
        <p className="text-sm">
          Location searched: <strong>{data.locationSearched}</strong>
        </p>
      )}
      {data.notices.map((notice) => (
        <Alert key={notice}>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ))}
      <ul className="space-y-4">
        {data.therapists.map((t) => (
          <li key={t.slug}>
            <TherapistCard therapist={t} />
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <ResultsPagination
          page={params.page}
          totalPages={totalPages}
          hrefFor={(page) => `/?${toQuery(withPage(params, page))}`}
          onPage={(page) => onChange(withPage(params, page))}
        />
      )}
    </section>
  );
}
