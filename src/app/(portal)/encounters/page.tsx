import { EncounterWorkspace } from "@/components/encounter-workspace";

type PageProps = {
  searchParams: Promise<{
    patientId?: string;
    encounterId?: string;
  }>;
};

export default async function EncountersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialPatientId =
    typeof params.patientId === "string" && params.patientId.trim()
      ? params.patientId.trim()
      : undefined;
  const initialEncounterId =
    typeof params.encounterId === "string" && params.encounterId.trim()
      ? params.encounterId.trim()
      : undefined;

  return <EncounterWorkspace initialEncounterId={initialEncounterId} initialPatientId={initialPatientId} />;
}
