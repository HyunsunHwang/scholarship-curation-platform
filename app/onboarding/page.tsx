import { getCachedSiteSettings, getHeaderLogoSrc } from "@/lib/public-data";
import OnboardingPageClient from "./OnboardingPageClient";

export default async function OnboardingPage() {
  const settings = await getCachedSiteSettings();
  return <OnboardingPageClient headerLogoSrc={getHeaderLogoSrc(settings)} />;
}
