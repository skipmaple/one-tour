import { Button, Stack, Title, Paper, Center, Text, Alert, Divider } from '@mantine/core'
import { usePage } from '@inertiajs/react'

// All icons from Simple Icons (https://simpleicons.org) — MIT license, fill-based monochrome
const ICONS = {
  github: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
  ),
  google: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
  ),
  wechat: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>
  ),
  feishu: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.354 2.773c-.323-.489-.017-1.146.556-1.191C6.723 1.368 10.958 2.87 13.29 6.078a.186.186 0 0 1-.058.267C10.768 8.123 8.793 10.574 7.85 13.466a.186.186 0 0 1-.312.063C5.624 11.37 3.742 7.496 3.354 2.773Zm6.55 13.451a.186.186 0 0 0-.28.049c-1.615 3.032-2.028 5.236-2.126 6.31-.05.549.483.954.976.71C12.058 21.345 18.397 17.18 21 11.82c.228-.47-.168-1-.647-.929-3.457.51-6.9 2.274-10.45 5.333Z"/></svg>
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

export default function Login() {
  const { flash } = usePage().props

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
            <OAuthButton provider="github" label="GitHub" icon={ICONS.github} />
            <OAuthButton provider="google_oauth2" label="Google" icon={ICONS.google} />
            <OAuthButton provider="wechat" label="WeChat" icon={ICONS.wechat} />
            <OAuthButton provider="feishu" label="Feishu" icon={ICONS.feishu} />

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
          </Stack>
        </Stack>
      </Paper>
    </Center>
  )
}

Login.layout = (page) => page
