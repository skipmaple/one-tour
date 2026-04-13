import { useState, useRef, useEffect } from 'react'

const INTENSITY_BG = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#ef4444',
}

const INTENSITY_LABEL = {
  green: '轻松',
  yellow: '中等',
  red: '高强度',
}

const TAG_COLORS = {
  scenic: '#15803d',
  food: '#c2410c',
  fuel: '#92400e',
  hike: '#7e22ce',
  stay: '#0369a1',
}

const styles = {
  card: (active, hovered) => ({
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    background: active ? '#e0f2fe' : hovered ? '#e2e8f0' : '#f1f5f9',
    border: `1.5px solid ${active ? '#0ea5e9' : hovered ? 'rgba(14,165,233,0.3)' : 'transparent'}`,
    transition: 'background 200ms, border 200ms',
  }),
  badge: (intensity) => ({
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: INTENSITY_BG[intensity] || INTENSITY_BG.green,
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  arrow: (active) => ({
    fontSize: 12,
    transition: 'transform 300ms ease',
    transform: active ? 'rotate(180deg)' : 'rotate(0deg)',
    color: '#64748b',
  }),
  meta: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
    fontSize: 12,
    color: '#64748b',
  },
  tag: (color) => ({
    fontSize: 12,
    color: color || '#475569',
  }),
  detailSection: {
    marginTop: 8,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 12,
    color: '#475569',
  },
  scheduleTime: {
    fontSize: 12,
    fontWeight: 600,
    color: '#0369a1',
    minWidth: 72,
    flexShrink: 0,
  },
  scheduleText: {
    fontSize: 13,
    color: '#334155',
  },
  tipBox: {
    background: '#fff7ed',
    borderLeft: '3px solid #ea580c',
    borderRadius: 4,
    padding: '8px 10px',
    marginTop: 8,
  },
  tipLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#c2410c',
    marginBottom: 2,
  },
  tipText: {
    fontSize: 12,
    color: '#9a3412',
    lineHeight: 1.5,
  },
  separator: {
    border: 'none',
    borderTop: '1px dashed #e2e8f0',
    margin: '8px 0',
  },
}

export default function DayCard({ day, active, onClick }) {
  const [hovered, setHovered] = useState(false)
  const detailRef = useRef(null)
  const [detailHeight, setDetailHeight] = useState(0)

  useEffect(() => {
    if (detailRef.current) {
      setDetailHeight(detailRef.current.scrollHeight)
    }
  }, [active, day])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-expanded={active}
      style={styles.card(active, hovered)}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={styles.badge(day.intensity)}>
          <span role="img" aria-label={`强度：${INTENSITY_LABEL[day.intensity] || '轻松'}`}>D{day.day}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
            {day.title}
          </div>
          {day.date && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{day.date}</div>
          )}
        </div>
        <span style={styles.arrow(active)}>▼</span>
      </div>

      {/* Meta line */}
      <div style={styles.meta}>
        {day.km > 0 && <span>📏 {day.km}km</span>}
        {day.drive && <span>🕐 {day.drive}</span>}
        {(day.tags || []).map((tag, i) => {
          const [type, label] = Array.isArray(tag) ? tag : [null, tag]
          return <span key={i} style={styles.tag(TAG_COLORS[type])}>{label}</span>
        })}
      </div>

      {/* Collapsible detail */}
      <div
        style={{
          maxHeight: active ? detailHeight || 800 : 0,
          overflow: 'hidden',
          transition: 'max-height 350ms ease',
        }}
      >
        <div
          ref={detailRef}
          aria-label={`第${day.day}天详细行程`}
        >
          {/* Schedule */}
          {day.schedule && day.schedule.length > 0 && (
            <div style={styles.detailSection}>
              {day.schedule.map((item, i) => {
                const [time, text] = Array.isArray(item) ? item : [item.time, item.label]
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                    <span style={styles.scheduleTime}>{time}</span>
                    <span style={styles.scheduleText}>{text}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Ticket */}
          {day.ticket && (
            <>
              <hr style={styles.separator} />
              <div style={styles.detailSection}>
                <div style={styles.detailLabel}>门票</div>
                <div style={styles.detailValue}>{day.ticket}</div>
              </div>
            </>
          )}

          {/* Food */}
          {day.food && (
            <div style={styles.detailSection}>
              <div style={styles.detailLabel}>美食</div>
              <div style={styles.detailValue}>{day.food}</div>
            </div>
          )}

          {/* Stay */}
          {day.stay && (
            <div style={styles.detailSection}>
              <div style={styles.detailLabel}>住宿</div>
              <div style={styles.detailValue}>{day.stay}</div>
            </div>
          )}

          {/* Tips */}
          {day.tips && (
            <div style={styles.tipBox}>
              <div style={styles.tipLabel}>提示</div>
              <div style={styles.tipText}>{day.tips}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
