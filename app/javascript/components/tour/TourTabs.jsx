import { Tabs } from '@mantine/core'
import { router } from '@inertiajs/react'

export default function TourTabs({ tour, active }) {
  const handleChange = (value) => {
    if (value === active) return
    const routes = {
      planner:      `/tours/${tour.id}`,
      timeline:     `/tours/${tour.id}/timeline`,
      constitution: `/tours/${tour.id}/constitution`,
    }
    router.visit(routes[value], { preserveScroll: true })
  }

  return (
    <Tabs value={active} onChange={handleChange} variant="outline">
      <Tabs.List>
        <Tabs.Tab value="constitution">宪法</Tabs.Tab>
        <Tabs.Tab value="planner">规划</Tabs.Tab>
        <Tabs.Tab value="timeline">总览</Tabs.Tab>
      </Tabs.List>
    </Tabs>
  )
}
