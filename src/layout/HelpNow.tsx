/**
 * Where to turn today, as a therapist found here is usually weeks from a first session. It holds in each of the UK's four
 * nations: 111's mental health option answers in England, Scotland and Wales, and Northern Ireland, which has no 111, has
 * Lifeline.
 */
export function HelpNow({ className }: { className?: string }) {
  return (
    <p className={className}>
      Need help now? In the UK, call <Phone number="111" /> and choose the mental health option (in Northern Ireland, Lifeline on{" "}
      <Phone number="0808 808 8000" />
      ), or Samaritans on <Phone number="116 123" />. In an emergency, call <Phone number="999" />.
    </p>
  );
}

/** A number a phone can dial at a tap. */
function Phone({ number }: { number: string }) {
  return (
    <a className="whitespace-nowrap underline" href={`tel:${number.replaceAll(" ", "")}`}>
      {number}
    </a>
  );
}
