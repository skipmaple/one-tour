import { Paper, Text } from '@mantine/core'

export default function ActivityCard({ activity }) {
  return (
    <Paper withBorder p={6}>
      <Text size="xs">{levelLabel(activity.citizen_level)} · {kindLabel(activity.kind)} {activity.name}</Text>
    </Paper>
  )
}
function levelLabel(l) { return { tier_one: '一等', tier_two: '二等', tier_three: '三等', infrastructure: '基础' }[l] || l }
function kindLabel(k) { return { scenic: '景', road: '路', food: '食', stay: '住', fuel: '油', other: '其他' }[k] || k }
