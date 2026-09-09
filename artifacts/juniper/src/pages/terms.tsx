import source from "@/content/terms-of-service.md?raw";
import { LegalPage } from "@/pages/legal-page";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      source={source}
      sibling={{ label: "Privacy Policy", href: "/privacy" }}
    />
  );
}
