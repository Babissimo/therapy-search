import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { HashRouter, Link, Route, Routes, useLocation, useNavigationType, useParams } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AboutDrawer, AboutPage } from "@/layout/About";
import { AccessibilityStatement } from "@/layout/AccessibilityStatement";
import { SiteLayout } from "@/layout/SiteLayout";
import { backgroundOf, useKeepOpened } from "@/lib/drawerRoute";
import { queryClient } from "@/lib/queryClient";
import { ProfileDrawer } from "@/profile/ProfileDrawer";
import { ProfilePage } from "@/profile/ProfilePage";
import { ONLINE_PATH } from "@/search/online";
import { SearchPage } from "@/search/SearchPage";
import { ABOUT_PATH, STATEMENT_PATH } from "@/site";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Pages and searches live after the #, so a reload or a shared link never sends them (see fragmentAddress). */}
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/** The site's pages; a profile or About opened from one of them shows in a drawer over it, which stays rendered beneath. */
export function AppRoutes() {
  const location = useLocation();
  // Read here, as the Routes below, given a location, report every arrival as a POP.
  const arrival = useNavigationType();
  const background = backgroundOf(location);
  useKeepOpened(location);
  // The drawer's page outlasts leaving it, so the drawer slides away still showing it.
  const [drawn, setDrawn] = useState(background && location);
  if (background && location !== drawn) setDrawn(location);
  return (
    <SiteLayout>
      <Routes location={background ?? location}>
        <Route path="/" element={<SearchPage />} />
        <Route path={ONLINE_PATH} element={<SearchPage />} />
        <Route path="/therapist/:slug" element={<ProfileRoute />} />
        {/* Followed by a link only where the statement itself was arrived at, not a drawer opened over it. */}
        <Route path={STATEMENT_PATH} element={<AccessibilityStatement followed={arrival === "PUSH" && !background} />} />
        <Route path={ABOUT_PATH} element={<AboutPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {drawn && (
        // At the location it opened at, so as it slides away the profile still reads the search it was opened from. Drawn afresh
        // for each history entry rather than each page, so each opening, even of a page opened before, knows what opened it.
        <Routes key={drawn.key} location={drawn}>
          <Route path="/therapist/:slug" element={<DrawerRoute open={background !== undefined} />} />
          <Route path={ABOUT_PATH} element={<AboutDrawer open={background !== undefined} />} />
        </Routes>
      )}
    </SiteLayout>
  );
}

function ProfileRoute() {
  const { slug = "" } = useParams();
  return <ProfilePage key={slug} slug={slug} />;
}

function DrawerRoute({ open }: { open: boolean }) {
  const { slug = "" } = useParams();
  return <ProfileDrawer slug={slug} open={open} />;
}

function NotFound() {
  return (
    <p>
      There's no page here.{" "}
      <Link to="/" className="underline">
        Search for a therapist
      </Link>
    </p>
  );
}
