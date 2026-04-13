import { Button, Stack, Title, Paper, Center, Text, Alert, Divider } from '@mantine/core'
import { usePage } from '@inertiajs/react'

const ICONS = {
  github: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  ),
  google: (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  ),
  wechat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#07C160">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05a6.03 6.03 0 01-.235-1.65c0-3.728 3.258-6.756 7.278-6.756.224 0 .444.012.663.03C16.627 4.68 12.98 2.188 8.691 2.188zm-2.51 4.08c.58 0 1.05.47 1.05 1.05s-.47 1.05-1.05 1.05-1.05-.47-1.05-1.05.47-1.05 1.05-1.05zm5.638 0c.58 0 1.05.47 1.05 1.05s-.47 1.05-1.05 1.05-1.05-.47-1.05-1.05.47-1.05 1.05-1.05zm3.636 4.402c-3.436 0-6.228 2.57-6.228 5.735 0 3.166 2.792 5.736 6.228 5.736.67 0 1.315-.103 1.928-.281a.72.72 0 01.597.08l1.392.814a.272.272 0 00.14.046c.133 0 .244-.11.244-.245 0-.06-.024-.118-.04-.176l-.286-1.083a.49.49 0 01.177-.554c1.522-1.12 2.496-2.775 2.496-4.618 0-3.164-2.792-5.454-6.648-5.454zm-2.44 3.07c.483 0 .875.39.875.875s-.392.875-.875.875a.875.875 0 010-1.75zm4.879 0c.483 0 .875.39.875.875s-.392.875-.875.875a.875.875 0 010-1.75z"/>
    </svg>
  ),
  feishu: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#3370FF">
      <path d="M2.572 10.459c2.127-2.861 5.133-4.956 8.545-5.936a1.21 1.21 0 00-.07-.146C9.861 2.053 7.098.578 5.148.025a.49.49 0 00-.538.2c-1.482 2.314-2.378 4.96-2.578 7.611a14.27 14.27 0 00.54 2.623z"/>
      <path d="M21.898 12.164a.49.49 0 00-.295-.447C17.854 9.882 13.37 9.882 9.62 11.717a14.17 14.17 0 00-5.77 5.227 12.67 12.67 0 00-.802 1.457c-.22.478-.409.97-.566 1.471a.49.49 0 00.632.598c2.078-.73 3.997-1.845 5.66-3.283a.12.12 0 01.16 0c1.49 1.342 3.262 2.34 5.186 2.924a.49.49 0 00.574-.243c1.074-1.944 4.007-3.17 6.94-4.225 1.032-.372.654-1.79.263-3.479z"/>
    </svg>
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
              leftSection={<span style={{ fontSize: 18 }}>🛠</span>}
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
