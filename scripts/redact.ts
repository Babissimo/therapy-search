import { parse } from "node-html-parser";

const PHONE = "01234 567890";
const EMAIL = "therapist@example.com";

/**
 * Replaces personal details in captured UKCP HTML with placeholders while keeping the markup
 * the parsers read. Names and slugs found in the page are replaced everywhere they occur.
 */
export function redact(html: string): string {
  const root = parse(html, { comment: true });
  const names = new Map<string, string>();
  const nameFor = (real: string) => {
    const clean = real.trim();
    if (!clean) return clean;
    if (!names.has(clean)) names.set(clean, `Test Therapist ${names.size + 1}`);
    return names.get(clean)!;
  };

  for (const h of root.querySelectorAll(".profile-listing h2, h1, .author-profile h4")) h.set_content(nameFor(h.text));
  for (const s of root.querySelectorAll(".profile-photo-placeholder span")) s.set_content("TT");
  for (const img of root.querySelectorAll("img.profile-photo, img.therapist-photo, .therapist-photo img")) {
    img.setAttribute("src", "https://example.invalid/photo.jpg");
    img.setAttribute("alt", "");
  }
  for (const s of root.querySelectorAll(".profile-listing-locations strong")) if (s.text.trim()) s.set_content("TESTTOWN AB1");
  for (const s of root.querySelectorAll(".profile-intro-locations")) s.set_content("Testtown");
  for (const s of root.querySelectorAll(".profile-listing-contact-session-type strong")) s.set_content(PHONE);
  for (const p of root.querySelectorAll(".profile-listing p")) p.set_content("Summary text.");
  for (const p of root.querySelectorAll(".profile-bio section > p")) p.set_content("First paragraph.<br><br>Second paragraph.");
  for (const s of root.querySelectorAll(".accordion-body span")) s.set_content("Detail line one.&#xA;Detail line two.");
  for (const a of root.querySelectorAll("address")) a.set_content("1 Test Street<br />Testtown AB1 2CD");
  for (const a of root.querySelectorAll(".profile-locations a.mini-cta")) a.setAttribute("href", "https://maps.example.invalid/");
  for (const a of root.querySelectorAll(".social-media-icons a")) a.setAttribute("href", "https://example.invalid/");
  for (const a of root.querySelectorAll(".therapist-contacts-details-tel a")) { a.setAttribute("href", "tel:01234567890"); a.set_content(PHONE); }
  for (const a of root.querySelectorAll(".therapist-contacts-details-email a")) { a.setAttribute("href", `mailto:${EMAIL}`); a.set_content(EMAIL); }
  for (const a of root.querySelectorAll(".therapist-contacts-details-web a")) { a.setAttribute("href", "https://example.invalid/"); a.set_content("https://example.invalid/"); }
  for (const input of root.querySelectorAll('input[name="__RequestVerificationToken"]')) input.setAttribute("value", "TOKEN");

  let out = root.toString();
  // Slugs are built from names, so they can carry accents, apostrophes and percent-escapes.
  const slugs = [...out.matchAll(/therapist\/([^\s"<>/?#]+-[A-Za-z0-9]{8})(?![A-Za-z0-9])/g)].flatMap((m) => (m[1] ? [m[1]] : []));
  [...new Set(slugs)].forEach((slug, i) => (out = out.replaceAll(slug, `Test-Therapist-${i + 1}-TESTID${String(i + 1).padStart(2, "0")}`)));
  for (const [real, fake] of [...names].sort((a, b) => b[0].length - a[0].length)) out = out.replaceAll(real, fake);
  return out
    .replace(/[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, EMAIL)
    .replace(/https:\/\/saukcp\.blob\.core\.windows\.net\/[^"')\s]+/g, "https://example.invalid/photo.jpg")
    .replace(/(?<![\w#-])\+?\d(?:[\d ]{8,13})\d(?![\w-])/g, PHONE);
}
