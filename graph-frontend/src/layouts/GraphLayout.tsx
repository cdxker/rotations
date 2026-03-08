import { useParams } from '@tanstack/react-router'
import { GraphProvider } from '../contexts/graphContext'
import type { ReactNode } from 'react'

export function GraphLayout({ children }: { children: ReactNode }) {
  const { username } = useParams({ strict: false }) as { username: string }
  return (
    <GraphProvider initialUser={username}>
      {children}
    </GraphProvider>
  )
}
