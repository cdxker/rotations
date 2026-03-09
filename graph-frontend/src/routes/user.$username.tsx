import { createFileRoute } from '@tanstack/react-router'
import { GraphLayout } from '../layouts/GraphLayout'
import { MusicGraph } from '../pages/MusicGraph'

export const Route = createFileRoute('/user/$username')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: () => (
    <GraphLayout>
      <MusicGraph />
    </GraphLayout>
  ),
  head: ({ params }) => ({
    meta: [
      { title: `${params.username}'s Graph` },
    ],
  }),
})
