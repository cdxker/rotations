import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <main className="bg-black text-white min-h-screen">
      <div>
        Music Graph baby
      </div>
    </main>
  )
}
