// Moved from pages/Tour/Constitution.jsx (2026-04-21) so ConstitutionDrawer can reuse.

export default function RedHeaderDocument({ children }) {
  return (
    <div>
      <div style={{ textAlign: 'center', borderBottom: '2px solid #c00', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#c00', letterSpacing: 8, fontFamily: '"SimSun", "宋体", serif' }}>
          《本程宪法》
        </div>
      </div>
      {children}
    </div>
  )
}
