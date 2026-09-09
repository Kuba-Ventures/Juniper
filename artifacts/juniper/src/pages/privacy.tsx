import source from "@/content/privacy-policy.md?raw";
import { LegalPage } from "@/pages/legal-page";

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      source={source}
      sibling={{ label: "Terms of Service", href: "/terms" }}
    />
  );
}
