import { Outlet } from "@tanstack/react-router"
import { GraphProvider } from "../contexts/graphContext"

export function RootLayout() {
  return (
    <GraphProvider>
      <Outlet />
    </GraphProvider>
  )
}
