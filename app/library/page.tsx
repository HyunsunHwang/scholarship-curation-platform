import HomeSearchRoot from "@/components/home/HomeSearchRoot";
import SpotifyTopNav from "@/components/home/SpotifyTopNav";
import LibraryHub from "@/components/library/LibraryHub";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkedScholarships } from "@/lib/user-bookmarks";
import { resolveNavUserContext } from "@/lib/nav-user-context";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const navContext = await resolveNavUserContext(user);

  const savedItems = user
    ? await getBookmarkedScholarships(supabase, user.id)
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HomeSearchRoot>
        <SpotifyTopNav
          variant="compact"
          currentUser={user}
          currentUserRole={navContext.role}
          currentUserName={navContext.name}
          urgentBookmarkCount={navContext.urgentBookmarkCount}
        />
      </HomeSearchRoot>
      <main className="flex-1 bg-white">
        <LibraryHub isLoggedIn={Boolean(user)} savedItems={savedItems} />
      </main>
    </div>
  );
}
