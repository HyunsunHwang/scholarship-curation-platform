import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteLogoForm from "@/app/admin/site-settings/SiteLogoForm";

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("site_settings")
    .select("header_logo_url, updated_at")
    .eq("id", 1)
    .maybeSingle();

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← 대시보드
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-6">설정</h1>

      <SiteLogoForm
        initialUrl={settings?.header_logo_url ?? null}
        updatedAt={settings?.updated_at ?? null}
      />
    </div>
  );
}
