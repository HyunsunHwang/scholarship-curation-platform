import CorporateHeader from "@/components/corporate/CorporateHeader";
import { requireAdmin } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { getCachedSiteSettings, getHeaderLogoSrc } from "@/lib/public-data";

export default async function CorporateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  const [siteSettings, supabase] = await Promise.all([
    getCachedSiteSettings(),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileTitle = user?.email ?? "관리자";
  let profileAvatarUrl: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, avatar_url")
      .eq("id", user.id)
      .single();
    profileTitle = profile?.name ?? user.email ?? "관리자";
    profileAvatarUrl = profile?.avatar_url ?? null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <CorporateHeader
        logoSrc={getHeaderLogoSrc(siteSettings)}
        profileTitle={profileTitle}
        profileAvatarUrl={profileAvatarUrl}
      />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
