import { useState, useEffect, useRef } from 'react'
import { Stack, TextInput, PinInput, Button, Alert, Text, Group, Anchor } from '@mantine/core'

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content || ''

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  })
  let data = {}
  try { data = await res.json() } catch { /* non-JSON body */ }
  return { ok: res.ok, status: res.status, data }
}

export default function EmailLoginForm() {
  const [stage, setStage] = useState('email') // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => () => clearInterval(timerRef.current), [])

  const startResendCountdown = () => {
    setResendIn(60)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setResendIn(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleSend = async (e) => {
    e?.preventDefault?.()
    if (!email.trim() || sending) return
    setError(null)
    setSending(true)
    const { ok, data } = await postJson('/auth/email/send', { email: email.trim() })
    setSending(false)
    if (ok) {
      setStage('code')
      setCode('')
      startResendCountdown()
    } else {
      setError(data.error || '发送失败，请稍后再试')
    }
  }

  const handleVerify = async (e) => {
    e?.preventDefault?.()
    if (code.length !== 6 || verifying) return
    setError(null)
    setVerifying(true)
    const { ok, data } = await postJson('/auth/email/verify', { email: email.trim(), code })
    setVerifying(false)
    if (ok && data.redirect) {
      window.location.href = data.redirect
    } else {
      setError(data.error || '验证失败')
      setCode('')
    }
  }

  if (stage === 'email') {
    return (
      <form onSubmit={handleSend}>
        <Stack gap="sm">
          <TextInput
            type="email"
            placeholder="邮箱地址"
            size="md"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            autoFocus
            required
          />
          {error && <Alert color="red" variant="light" py="xs">{error}</Alert>}
          <Button type="submit" size="md" fullWidth loading={sending} disabled={!email.trim()}>
            发送验证码
          </Button>
        </Stack>
      </form>
    )
  }

  return (
    <form onSubmit={handleVerify}>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">验证码已发送至 {email}</Text>
          <Anchor
            component="button"
            type="button"
            size="xs"
            onClick={() => { setStage('email'); setError(null); setCode('') }}
          >
            修改邮箱
          </Anchor>
        </Group>
        <Group justify="center">
          <PinInput
            length={6}
            type="number"
            oneTimeCode
            size="md"
            value={code}
            onChange={setCode}
            autoFocus
          />
        </Group>
        {error && <Alert color="red" variant="light" py="xs">{error}</Alert>}
        <Button type="submit" size="md" fullWidth loading={verifying} disabled={code.length !== 6}>
          登录
        </Button>
        <Button
          variant="subtle"
          size="xs"
          fullWidth
          disabled={resendIn > 0 || sending}
          loading={sending}
          onClick={handleSend}
        >
          {resendIn > 0 ? `重新发送（${resendIn}s）` : '重新发送验证码'}
        </Button>
      </Stack>
    </form>
  )
}
