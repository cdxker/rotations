import { createFileRoute } from '@tanstack/react-router'
import { GraphLayout } from '../layouts/GraphLayout'
import { MusicGraph } from '../pages/MusicGraph'

export const Route = createFileRoute('/user/$username')({
  validateSearch: (search: Record<string, unknown>): { q?: string; artists?: string[]; next?: number; prev?: number } => ({
    q: typeof search.q === "string" ? search.q : undefined,
    artists: Array.isArray(search.artists)
      ? search.artists.filter((a): a is string => typeof a === "string")
      : typeof search.artists === "string" ? [search.artists] : undefined,
    next: typeof search.next === "number" ? search.next : typeof search.next === "string" ? Number(search.next) || undefined : undefined,
    prev: typeof search.prev === "number" ? search.prev : typeof search.prev === "string" ? Number(search.prev) || undefined : undefined,
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
