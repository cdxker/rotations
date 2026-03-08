import { createFileRoute } from '@tanstack/react-router'
import { GraphLayout } from '../layouts/GraphLayout'
import { MusicGraph } from '../pages/MusicGraph'

export const Route = createFileRoute('/user/$username')({
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
