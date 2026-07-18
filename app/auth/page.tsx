import { getCachedSiteSettings, getHeaderLogoSrc } from "@/lib/public-data";
import AuthPageClient from "./AuthPageClient";

export default async function AuthPage() {
  const settings = await getCachedSiteSettings();
  return <AuthPageClient headerLogoSrc={getHeaderLogoSrc(settings)} />;
}
