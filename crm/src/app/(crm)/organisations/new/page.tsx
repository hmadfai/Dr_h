import { PageHeader } from "@/components/ui";
import { OrganisationForm } from "@/components/organisation-form";

export default function NewOrganisationPage() {
  return (
    <div>
      <PageHeader
        title="Add employer organisation"
        description="DAS account holder name, job title, email, phone and DAS account ID are mandatory."
      />
      <OrganisationForm />
    </div>
  );
}
