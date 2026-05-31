import { getCachedSiteSettings, getHeaderLogoSrc } from "@/lib/public-data";
import PartnerSignupClient from "./PartnerSignupClient";

export default async function PartnerSignupPage() {
  const settings = await getCachedSiteSettings();
  return <PartnerSignupClient headerLogoSrc={getHeaderLogoSrc(settings)} />;
}
