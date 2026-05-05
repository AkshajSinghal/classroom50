import { createRootRoute, Outlet } from '@tanstack/react-router'
import App from '@/App'

const RootComponent = () => {
  return (
    <>
      <Outlet />
    </>
  )
}

export const Route = createRootRoute({
  component: RootComponent
})

