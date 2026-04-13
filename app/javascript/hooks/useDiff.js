import { useMemo } from 'react'
import { diffLines } from 'diff'
import yaml from 'js-yaml'

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) return {}
  try {
    return yaml.load(match[1]) || {}
  } catch {
    return {}
  }
}

export function computeSemanticSummary(oldContent, newContent) {
  const oldFm = parseFrontmatter(oldContent)
  const newFm = parseFrontmatter(newContent)
  const summary = []

  if (oldFm.title !== newFm.title) {
    summary.push(`标题："${oldFm.title || '(无)'}" → "${newFm.title || '(无)'}"`)
  }

  const oldDays = oldFm.days || []
  const newDays = newFm.days || []

  if (oldDays.length !== newDays.length) {
    summary.push(`天数：${oldDays.length} 天 → ${newDays.length} 天`)
  }

  const minLen = Math.min(oldDays.length, newDays.length)
  for (let i = 0; i < minLen; i++) {
    const od = oldDays[i]
    const nd = newDays[i]
    if (JSON.stringify(od) !== JSON.stringify(nd)) {
      const dayNum = nd.day || i + 1
      const changes = []
      if (od.title !== nd.title) changes.push(`标题："${od.title}" → "${nd.title}"`)
      if (od.drive !== nd.drive) changes.push(`车程：${od.drive || '(无)'} → ${nd.drive || '(无)'}`)
      if (JSON.stringify(od.stay) !== JSON.stringify(nd.stay)) changes.push('住宿变更')
      if (JSON.stringify(od.food) !== JSON.stringify(nd.food)) changes.push('餐饮变更')
      if (JSON.stringify(od.schedule) !== JSON.stringify(nd.schedule)) changes.push('行程变更')
      summary.push(`第 ${dayNum} 天：${changes.join('、') || '内容变更'}`)
    }
  }

  for (let i = minLen; i < newDays.length; i++) {
    const nd = newDays[i]
    summary.push(`新增第 ${nd.day || i + 1} 天：${nd.title || '(未命名)'}`)
  }

  for (let i = minLen; i < oldDays.length; i++) {
    const od = oldDays[i]
    summary.push(`删除第 ${od.day || i + 1} 天：${od.title || '(未命名)'}`)
  }

  const topFields = ['date_range', 'vehicle', 'trip_style', 'total_km', 'budget_per_person']
  for (const key of topFields) {
    if (JSON.stringify(oldFm[key]) !== JSON.stringify(newFm[key])) {
      summary.push(`${key}："${oldFm[key] ?? '(无)'}" → "${newFm[key] ?? '(无)'}"`)
    }
  }

  return summary
}

export function buildSideBySideLines(oldText, newText) {
  const changes = diffLines(oldText, newText)
  const leftLines = []
  const rightLines = []

  for (const part of changes) {
    const lines = part.value.replace(/\n$/, '').split('\n')

    if (part.added) {
      for (const line of lines) {
        leftLines.push({ text: '', type: 'pad' })
        rightLines.push({ text: line, type: 'added' })
      }
    } else if (part.removed) {
      for (const line of lines) {
        leftLines.push({ text: line, type: 'removed' })
        rightLines.push({ text: '', type: 'pad' })
      }
    } else {
      for (const line of lines) {
        leftLines.push({ text: line, type: 'unchanged' })
        rightLines.push({ text: line, type: 'unchanged' })
      }
    }
  }

  return { leftLines, rightLines }
}
