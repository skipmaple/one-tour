import { Button, Stack, Title, Paper, Center, Text, Alert, Divider } from '@mantine/core'
import { usePage } from '@inertiajs/react'

function OAuthButton({ provider, label }) {
  return (
    <form action={`/auth/${provider}`} method="post">
      <input type="hidden" name="authenticity_token" value={document.querySelector('meta[name="csrf-token"]')?.content || ''} />
      <Button type="submit" variant="default" fullWidth size="md">
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
          <Title order={2}>Login</Title>
          <Text size="sm" c="dimmed">Choose a provider to continue</Text>

          {flash?.alert && (
            <Alert color="red" variant="light" w="100%">
              {flash.alert}
            </Alert>
          )}

          <Stack w="100%" gap="sm">
            <OAuthButton provider="github" label="GitHub" />
            <OAuthButton provider="google_oauth2" label="Google" />
            <OAuthButton provider="wechat" label="WeChat" />
            <OAuthButton provider="feishu" label="Feishu" />

            <Divider label="Development" labelPosition="center" />

            <Button
              component="a"
              href="/auth/developer"
              variant="light"
              color="gray"
              fullWidth
              size="md"
            >
              Developer Login
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Center>
  )
}

Login.layout = (page) => page
