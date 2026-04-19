import yaml from 'js-yaml'

// Text labels for intensity — the rendered markdown is shown to users, and
// emoji-free keeps the doc consistent with the rest of the UI.
const INTENSITY_LABEL = { green: '轻', yellow: '中', red: '重' }

/**
 * Generate a human-readable markdown body from frontmatter data.
 * Used as a fallback when the LLM only outputs frontmatter without a body.
 */
export function generateMarkdownBody(frontmatter) {
  if (!frontmatter || !frontmatter.title) return ''

  const lines = []

  // Title
  lines.push(`# ${frontmatter.title}`)
  lines.push('')

  // Overview info
  const meta = []
  if (frontmatter.date_range) meta.push(`**日期** ${frontmatter.date_range}`)
  if (frontmatter.vehicle) meta.push(`**车辆** ${frontmatter.vehicle}`)
  if (frontmatter.team_size) meta.push(`**人数** ${frontmatter.team_size}`)
  if (frontmatter.total_km) meta.push(`**总里程** ${frontmatter.total_km}km`)
  if (frontmatter.budget_per_person) meta.push(`**人均预算** ${frontmatter.budget_per_person}`)
  if (meta.length > 0) {
    lines.push(`> ${meta.join(' | ')}`)
    lines.push('')
  }

  const days = frontmatter.days || []
  if (days.length === 0) return lines.join('\n')

  // Overview table
  lines.push('## 行程总览')
  lines.push('')
  lines.push('| 天 | 行程 | 里程 | 驾驶 | 强度 |')
  lines.push('|:--:|------|-----:|-----:|:----:|')
  for (const day of days) {
    const intensity = INTENSITY_LABEL[day.intensity] || ''
    lines.push(`| D${day.day} | ${day.title || ''} | ${day.km || '—'} | ${day.drive || '—'} | ${intensity} |`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')

  // Day details
  for (const day of days) {
    const intensity = INTENSITY_LABEL[day.intensity] || ''
    const intensityTag = intensity ? ` [${intensity}]` : ''
    const dateStr = day.date ? ` · ${day.date}` : ''
    lines.push(`### D${day.day}${dateStr}${intensityTag} ${day.title || ''}`)
    lines.push('')

    if (day.desc) {
      lines.push(day.desc)
      lines.push('')
    }

    // Schedule table
    const schedule = day.schedule || []
    if (schedule.length > 0) {
      lines.push('| 时间 | 事项 |')
      lines.push('|------|------|')
      for (const item of schedule) {
        if (Array.isArray(item) && item.length >= 2) {
          lines.push(`| ${item[0]} | ${item[1]} |`)
        }
      }
      lines.push('')
    }

    if (day.food) lines.push(`**美食推荐**：${day.food}`)
    if (day.stay) lines.push(`**住宿**：${day.stay}`)
    if (day.ticket) lines.push(`**门票**：${day.ticket}`)
    if (day.tips) lines.push(`**提醒**：${day.tips}`)

    if (day.food || day.stay || day.ticket || day.tips) lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Ensure content has a markdown body. If the body after frontmatter is empty/minimal,
 * generate one from the frontmatter data.
 */
export function ensureMarkdownBody(content) {
  const match = content.match(/^(---\s*\n[\s\S]*?\n---)\s*\n?([\s\S]*)$/)
  if (!match) return content

  const frontmatterBlock = match[1]
  const body = match[2].trim()

  // If body already has structured guidebook content (day sections with headings), keep it
  if (body.includes('### D') || body.includes('## 行程总览')) return content

  // Parse frontmatter to generate body
  const yamlContent = frontmatterBlock.replace(/^---\s*\n/, '').replace(/\n---$/, '')
  let frontmatter
  try {
    frontmatter = yaml.load(yamlContent)
  } catch {
    return content
  }

  const generatedBody = generateMarkdownBody(frontmatter)
  if (!generatedBody) return content

  return `${frontmatterBlock}\n\n${generatedBody}`
}
