/**
 * Where to turn today, as a therapist found here is usually weeks from a first session. It holds in each of the UK's four
 * nations: 111's mental health option answers in England, Scotland and Wales, and Northern Ireland, which has no 111, has
 * Lifeline. Shout answers by text, for anyone who can't talk. Names and numbers are kept from machine translation, as a
 * caller needs them as they are. index.html's fallback page carries a copy.
 */
export function HelpNow({ className }: { className?: string }) {
  return (
    <p className={className}>
      Need help now? In the UK, call <Phone number="111" /> and choose the mental health option (in Northern Ireland,{" "}
      <span translate="no">Lifeline</span> on <Phone number="0808 808 8000" />
      ), <span translate="no">Samaritans</span> on <Phone number="116 123" />, or text <Text word="SHOUT" number="85258" />. In an
      emergency, call <Phone number="999" />.
    </p>
  );
}

/** A number a phone texts at a tap, the word already typed: the `?&` form, as Shout's own link has it, works on iOS and Android. */
function Text({ word, number }: { word: string; number: string }) {
  return (
    <a translate="no" className="whitespace-nowrap underline" href={`sms:${number}?&body=${word}`}>
      {word} to {number}
    </a>
  );
}

/** A number a phone can dial at a tap. */
function Phone({ number }: { number: string }) {
  return (
    <a translate="no" className="whitespace-nowrap underline" href={`tel:${number.replaceAll(" ", "")}`}>
      {number}
    </a>
  );
}
