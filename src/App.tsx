import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Route, Routes, useLocation, useParams } from "react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AboutPage } from "@/layout/AboutPage";
import { SiteLayout } from "@/layout/SiteLayout";
import { ProfileDrawer } from "@/profile/ProfileDrawer";
import { ProfilePage } from "@/profile/ProfilePage";
import { backgroundOf } from "@/profile/profileLink";
import { SearchPage } from "@/search/SearchPage";

// Retrying would repeat requests to UKCP that already failed or were rate-limited.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15 * 60 * 1000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/** The site's pages; a profile opened from one of them shows in a drawer over it, which stays rendered beneath. */
export function AppRoutes() {
  const location = useLocation();
  const background = backgroundOf(location);
  return (
    <SiteLayout>
      <Routes location={background ?? location}>
        <Route path="/" element={<SearchPage />} />
        <Route path="/therapist/:slug" element={<ProfileRoute />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {background && (
        <Routes>
          <Route path="/therapist/:slug" element={<ProfileRoute drawer />} />
        </Routes>
      )}
    </SiteLayout>
  );
}

function ProfileRoute({ drawer = false }: { drawer?: boolean }) {
  const { slug = "" } = useParams();
  return drawer ? <ProfileDrawer key={slug} slug={slug} /> : <ProfilePage key={slug} slug={slug} />;
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
