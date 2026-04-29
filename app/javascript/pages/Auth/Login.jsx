import { useState } from 'react'
import { Button, Stack, Title, Paper, Center, Text, Alert, Divider, TextInput, PasswordInput } from '@mantine/core'
import { usePage } from '@inertiajs/react'
import EmailLoginForm from '../../components/EmailLoginForm'

// All icons from Simple Icons (https://simpleicons.org) — MIT license, fill-based monochrome
const ICONS = {
  github: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
  ),
  google: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
  ),
  feishu: (
    <svg width="18" height="18" viewBox="7 7 26 26" fill="currentColor"><path d="m21.069 20.504.063-.06.125-.122.085-.084.256-.254.348-.344.299-.296.281-.278.293-.289.269-.266.374-.37.218-.206.419-.359.404-.306.598-.386.617-.33.606-.265.348-.127.177-.058a14.8 14.8 0 0 0-2.793-5.603 1.34 1.34 0 0 0-1.047-.502H12.221a.201.201 0 0 0-.119.364 31.5 31.5 0 0 1 8.943 10.162z"/><path d="M16.791 30c5.57 0 10.423-3.074 12.955-7.618q.133-.239.258-.484a6 6 0 0 1-.595.929 6 6 0 0 1-.413.48 6 6 0 0 1-.647.579 7 7 0 0 1-.723.527c-.097.057-.134.081-.204.119q-.21.116-.428.215a6 6 0 0 1-.815.295 6 6 0 0 1-1.152.198 6.125 6.125 0 0 1-2.494-.148l-.555-.155-.685-.206-.651-.211-.475-.164-.446-.2-.496-.191-.581-.224-.492-.198-.425-.178-.377-.157-.344-.157-.312-.143-.359-.166-.43-.207-.411-.201a31.2 31.2 0 0 1-8.822-6.583.202.202 0 0 0-.349.138l.005 10.293c0 .448.222.87.595 1.118A14.75 14.75 0 0 0 16.791 30"/><path d="M33.151 16.582a8.45 8.45 0 0 0-6.047-.552l-.429.185-.606.265-.617.33-.598.386-.823.665-.592.576-.562.555-.58.574-.604.598-.341.338-.21.206-.095.09a15 15 0 0 1-3.177 2.274l.359.166.344.157.377.157.425.178.492.198.581.224.446.2.475.164.651.211.685.206.555.155.579.141.433.062.585.037.525-.014.491-.055a6 6 0 0 0 .66-.143l.43-.138.385-.158.427-.215.204-.119.191-.122.292-.21.24-.195.407-.384.413-.48a6 6 0 0 0 .421-.693l1.449-2.887a8.1 8.1 0 0 1 1.697-2.439z"/></svg>
  ),
}

function OAuthButton({ provider, label, icon }) {
  return (
    <form action={`/auth/${provider}`} method="post">
      <input type="hidden" name="authenticity_token" value={document.querySelector('meta[name="csrf-token"]')?.content || ''} />
      <Button type="submit" variant="default" fullWidth size="md" leftSection={icon}>
        {label}
      </Button>
    </form>
  )
}

function StagingQuickLogin() {
  const [userId, setUserId] = useState('1')
  const [secret, setSecret] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/login_test', {
        method: 'POST',
        headers: {
          'X-Staging-Login-Secret': secret,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `user_id=${encodeURIComponent(userId)}`,
      })
      if (res.ok) {
        window.location.href = '/'
      } else if (res.status === 429) {
        // Rails 8 rate_limit 触发:同 IP 1 分钟 5 次。提示去等
        setError('请求过于频繁,请等 1 分钟后再试')
      } else {
        // staging gate:secret 错 / user_id 不存在都返 404,不区分(防探测)
        setError('登入失败 — secret 或 user_id 错误')
      }
    } catch (err) {
      setError(`网络错误:${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="xs">
        <TextInput
          label="User ID"
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          size="sm"
        />
        <PasswordInput
          label="Staging Secret"
          description="从 .env.staging 拷"
          required
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          size="sm"
        />
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Button type="submit" loading={submitting} fullWidth size="md" color="orange">
          Staging 登入
        </Button>
      </Stack>
    </form>
  )
}

export default function Login() {
  const { flash, dev_login_enabled, staging_login_enabled } = usePage().props

  return (
    <Center mih="80vh">
      <Paper shadow="sm" p="xl" radius="md" w={400}>
        <Stack align="center" gap="lg">
          <Title order={2}>登录</Title>
          <Text size="sm" c="dimmed">选择登录方式</Text>

          {flash?.alert && (
            <Alert color="red" variant="light" w="100%">
              {flash.alert}
            </Alert>
          )}

          <Stack w="100%" gap="sm">
            <EmailLoginForm />

            <Divider label="或使用社交账号登录" labelPosition="center" my="xs" />

            <OAuthButton provider="github" label="GitHub" icon={ICONS.github} />
            <OAuthButton provider="google_oauth2" label="Google" icon={ICONS.google} />
            <OAuthButton provider="feishu" label="Feishu" icon={ICONS.feishu} />

            {dev_login_enabled && (
              <>
                <Divider label="开发环境" labelPosition="center" />
                <Button
                  component="a"
                  href="/auth/developer"
                  variant="light"
                  color="gray"
                  fullWidth
                  size="md"
                  leftSection={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}
                >
                  开发者登录
                </Button>
              </>
            )}

            {staging_login_enabled && (
              <>
                <Divider label="Staging 环境" labelPosition="center" />
                <StagingQuickLogin />
              </>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Center>
  )
}

Login.layout = (page) => page
