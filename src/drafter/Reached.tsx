import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * How the draft went on: copied, opened in the email app (copied too where the app may cut it short), or a phone link
 * followed, any of which may mean the visitor got in touch; or refused by the clipboard.
 */
export type Reach = "copied" | "emailed" | "emailed and copied" | "phoned" | "refused";

type Props = {
  first: string;
  reach: Reach;
  open: boolean;
  onClose: () => void;
  onMarked: () => void;
  /** Once it has gone, for the keyboard to go back to the drafter. */
  onGone: () => void;
};

/**
 * Says how the draft went and asks whether to mark the therapist contacted, as copying or following a link doesn't mean the
 * visitor got in touch. A popup, as the drafter's foot may be out of sight beneath its buttons.
 */
export function Reached({ first, reach, open, onClose, onMarked, onGone }: Props) {
  const { title, text } = told(reach, first);
  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        // Off paper, as the drafter beneath is.
        className="print:hidden"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onGone();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-base">{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {reach === "refused" ? (
            <AlertDialogCancel variant="default">Select the message</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel>Not now</AlertDialogCancel>
              <AlertDialogAction onClick={onMarked}>Mark as contacted</AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function told(reach: Reach, first: string): { title: string; text: string } {
  const asked = `Mark ${first} as contacted?`;
  const emailed = `Your email to ${first} should open in your email app, ready to send.`;
  switch (reach) {
    case "copied":
      return { title: "Copied", text: `Your subject and message are ready to paste. ${asked}` };
    case "emailed":
      return { title: asked, text: emailed };
    case "emailed and copied":
      return { title: asked, text: `${emailed} The message is copied too, in case your email app cuts it short.` };
    case "phoned":
      return { title: asked, text: `Your phone app should open, ready to call ${first}.` };
    case "refused":
      return { title: "Couldn't copy it", text: "This browser didn't allow it. Select the message, then press Ctrl+C (⌘C on a Mac) to copy it." };
  }
}
