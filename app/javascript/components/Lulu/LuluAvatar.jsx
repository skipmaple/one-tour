// Logomark — front-facing fawn head on Mantine blue.6.
// Reference render lulu-L01-v2.png is the locked v11 image; pending vector
// re-cut by the illustrator (Brief §08 L01). Brief rule: only #228be6 + #fff.

const LULU_LOGOMARK_SRC = '/lulu/lulu-L01-v2.png'

export default function LuluAvatar({
  size = 120,
  radius = '22%',
  style = {},
  alt = '路路 logomark',
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        background: '#228be6',
        flexShrink: 0,
        boxShadow: size >= 120 ? '0 8px 32px rgba(34,139,230,0.18)' : 'none',
        ...style,
      }}
    >
      <img
        src={LULU_LOGOMARK_SRC}
        alt={alt}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  )
}

export { LULU_LOGOMARK_SRC }
