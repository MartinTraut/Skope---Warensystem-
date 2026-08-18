import { ArticleDetailView } from "@/components/inventory/detail/article-detail-view"

/**
 * `params` ist in Next 16 ein Promise und muss awaited werden — synchroner
 * Zugriff wurde mit der Version entfernt.
 */
export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ArticleDetailView articleId={id} />
}
