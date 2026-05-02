// Mascot — full-body walking fawn on Mantine blue.6.
// Reference render lulu-full-v1.png is the locked v1 image (Brief §08 M01).
// Brief rule: only #228be6 + #fff. Faces right by default.

const LULU_FULL_SRC = '/lulu/lulu-full-v1.png'

export default function LuluFull({
  size = 200,
  bg = 'blue',
  radius = 0,
  flip = false,
  style = {},
  alt = '路路 mascot',
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        background: bg === 'blue' ? '#228be6' : 'transparent',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <img
        src={LULU_FULL_SRC}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          transform: flip ? 'scaleX(-1)' : 'none',
          ...(bg === 'transparent' ? { mixBlendMode: 'multiply' } : {}),
        }}
      />
    </div>
  )
}

export { LULU_FULL_SRC }
