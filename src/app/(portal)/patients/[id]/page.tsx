import { PatientFilePageClient } from "@/components/patient-file-page-client";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PatientFilePage({ params }: PageProps) {
  const { id } = await params;
  return <PatientFilePageClient patientId={id} />;
}
