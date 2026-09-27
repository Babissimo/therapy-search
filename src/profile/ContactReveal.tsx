import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** UKCP's "Show contact details": one request per click, so UKCP sees each one. */
export function ContactReveal({ id }: { id: string }) {
  const reveal = useMutation({ mutationFn: () => api.contact(id) });

  if (!reveal.data) {
    return (
      <div className="space-y-2">
        <Button variant="secondary" onClick={() => reveal.mutate()} disabled={reveal.isPending}>
          {reveal.isPending ? "Loading…" : "Show contact details"}
        </Button>
        {reveal.error && <p className="text-sm text-destructive">{reveal.error.message}</p>}
      </div>
    );
  }

  const { phone, email, website } = reveal.data;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {phone && (
        <>
          <dt className="font-medium">Telephone</dt>
          <dd>
            <a className="underline" href={`tel:${phone.replace(/\s/g, "")}`}>
              {phone}
            </a>
          </dd>
        </>
      )}
      {email && (
        <>
          <dt className="font-medium">Email</dt>
          <dd>
            <a className="underline" href={`mailto:${email}`}>
              {email}
            </a>
          </dd>
        </>
      )}
      {website && (
        <>
          <dt className="font-medium">Website</dt>
          <dd>
            <a className="underline" href={website} target="_blank" rel="noreferrer">
              {website}
            </a>
          </dd>
        </>
      )}
      {!phone && !email && !website && <dd className="col-span-2 text-muted-foreground">No contact details are listed.</dd>}
    </dl>
  );
}
