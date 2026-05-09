import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import dynamic from "next/dynamic";
import { getHeroIllustrationPublicUrl } from "@/lib/hero-illustration-url";
import {
  createPublicSupabaseClient,
  getCachedHomeScholarships,
} from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";

const ScholarshipDashboard = dynamic(
  () => import("@/components/ScholarshipDashboard"),
  {
    loading: () => (
      <section className="bg-[#fafafa] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="aspect-2/3 animate-pulse rounded-2xl bg-gray-200"
              />
            ))}
          </div>
        </div>
      </section>
    ),
  }
);

export default async function Home() {
  const homeScholarships = await getCachedHomeScholarships();
  const publicSupabase = createPublicSupabaseClient();
  const heroIllustrationUrl = getHeroIllustrationPublicUrl(publicSupabase);

  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  let bookmarkedIds: number[] = [];
  if (user) {
    const { data: bookmarkRows } = await authSupabase
      .from("bookmarks")
      .select("scholarship_id")
      .eq("user_id", user.id);
    bookmarkedIds = (bookmarkRows ?? []).map((r) => r.scholarship_id);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar currentUser={user} />
      <main className="flex-1">
        <Hero heroIllustrationUrl={heroIllustrationUrl} />
        <ScholarshipDashboard
          scholarships={homeScholarships}
          bookmarkedIds={bookmarkedIds}
          totalScholarshipCount={homeScholarships.length}
        />
      </main>
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-gray-600">
            문의 메일:{" "}
            <a
              href="mailto:hyunsun4819@gmail.com"
              className="font-medium text-brand hover:underline"
            >
              hyunsun4819@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
