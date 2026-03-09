import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const [username, setUsername] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = username.trim()
    if (trimmed) {
      navigate({ to: '/user/$username', params: { username: trimmed } })
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white dark:bg-black text-black dark:text-white">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Last.fm username"
          className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
          autoFocus
        />
        <button
          type="submit"
          className="px-4 py-2 bg-neutral-800 dark:bg-white text-white dark:text-black hover:opacity-80"
        >
          View Graph
        </button>
      </form>
    </main>
  )
}
