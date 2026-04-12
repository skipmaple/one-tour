import { Button, Stack, Title, Paper, Center, Text } from '@mantine/core'

export default function Login() {
  return (
    <Center mih="80vh">
      <Paper shadow="sm" p="xl" radius="md" w={400}>
        <Stack align="center" gap="lg">
          <Title order={2}>Login</Title>
          <Text size="sm" c="dimmed">Choose a provider to continue</Text>

          <Stack w="100%" gap="sm">
            <Button component="a" href="/auth/github" data-method="post" variant="default" fullWidth size="md">
              GitHub
            </Button>
            <Button component="a" href="/auth/google_oauth2" data-method="post" variant="default" fullWidth size="md">
              Google
            </Button>
            <Button component="a" href="/auth/wechat" data-method="post" variant="default" fullWidth size="md">
              WeChat
            </Button>
            <Button component="a" href="/auth/feishu" data-method="post" variant="default" fullWidth size="md">
              Feishu
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Center>
  )
}

Login.layout = (page) => page
