import { CONTACT_URL } from "@/site";

export function AboutPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">About this site</h1>
      <p>
        This is an unofficial, simpler page for searching the{" "}
        <a className="underline" href="https://www.psychotherapy.org.uk/find-a-therapist/">
          UK Council for Psychotherapy's therapist directory
        </a>
        . It is not run by, affiliated with or endorsed by UKCP.
      </p>
      <p>
        Every search and profile is fetched from UKCP's own site when you ask for it, and shown as UKCP returns it. Nothing is copied into a
        database here. Identical searches are reused for 15 minutes and profiles for an hour, so that repeated visits don't add load to UKCP's
        servers, and each visitor's requests are rate-limited.
      </p>
      <p>
        No searches are logged. Your browser keeps one random number so that results stay in the same order while you page through them,
        and your choice of light or dark theme if you pick one.
      </p>
      <p>
        If you're from UKCP, or have any concern about this site,{" "}
        <a className="underline" href={CONTACT_URL}>
          get in touch
        </a>
        .
      </p>
    </article>
  );
}
