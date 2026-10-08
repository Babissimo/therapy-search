import { Suspense } from "react";
import { Link } from "react-router";
import { ErrorLine } from "@/components/ErrorLine";
import { LoadFailed } from "@/components/LoadFailed";
import { LoadingLine } from "@/components/LoadingLine";
import { lazyChunk } from "@/lib/lazyChunk";
import { useTitle } from "@/lib/useTitle";

/** The questions, in a chunk of their own, kept out of the search page's. */
const { Component: Page, load } = lazyChunk(() => import("./QuestionsPage").then((module) => module.QuestionsPage));

/** The questions, drawn once their chunk is here, with a line in their place while the chunk comes or if it can't. */
export function LazyQuestionsPage() {
  return (
    <LoadFailed fallback={<Failed />}>
      <Suspense fallback={<Loading />}>
        <Page />
      </Suspense>
    </LoadFailed>
  );
}

/** Names the page until the questions' own headings do. */
function Loading() {
  useTitle("A few questions");
  return <LoadingLine>Loading the questions</LoadingLine>;
}

/** The line shown if the chunk can't be fetched. The page's own Back is in that chunk, so the way on from here is the search. */
function Failed() {
  useTitle("The questions couldn't be shown");
  return (
    <ErrorLine>
      The questions couldn't be shown just now. Reload the page to try again, or{" "}
      <Link className="underline" to="/">
        search for a therapist
      </Link>
      .
    </ErrorLine>
  );
}

/** Fetches the questions' chunk as the way to them is pointed at or focused, so they open drawn. */
export function preloadQuestions(): void {
  void load().catch(() => {});
}
