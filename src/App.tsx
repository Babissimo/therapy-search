import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { HashRouter, Link, Route, Routes, useLocation, useParams } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteLayout } from "@/layout/SiteLayout";
import { queryClient } from "@/lib/queryClient";
import { ProfileDrawer } from "@/profile/ProfileDrawer";
import { ProfilePage } from "@/profile/ProfilePage";
import { backgroundOf } from "@/profile/profileLink";
import { ONLINE_PATH } from "@/search/online";
import { SearchPage } from "@/search/SearchPage";

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

/** The site's pages; a profile opened from one of them shows in a drawer over it, which stays rendered beneath. */
export function AppRoutes() {
  const location = useLocation();
  const background = backgroundOf(location);
  // The drawer's profile outlasts leaving it, so the drawer slides away still showing it.
  const [drawn, setDrawn] = useState(background && location);
  if (background && location !== drawn) setDrawn(location);
  return (
    <SiteLayout>
      <Routes location={background ?? location}>
        <Route path="/" element={<SearchPage />} />
        <Route path={ONLINE_PATH} element={<SearchPage />} />
        <Route path="/therapist/:slug" element={<ProfileRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {drawn && (
        // At the location it opened at, so as it slides away the profile still reads the search it was opened from.
        <Routes location={drawn}>
          <Route path="/therapist/:slug" element={<DrawerRoute open={background !== undefined} />} />
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
  // By history entry rather than profile, so each opening, even of a profile opened before, knows what opened it.
  const { key } = useLocation();
  return <ProfileDrawer key={key} slug={slug} open={open} />;
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
