import { UnitDetailView } from "@/components/units/detail/unit-detail-view"

/**
 * `params` ist in Next 16 ein Promise und muss awaited werden — synchroner
 * Zugriff wurde mit der Version entfernt.
 */
export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <UnitDetailView unitId={id} />
}
