import { Alert, Button, Stack } from '@mantine/core'

export default function ErrorFallback() {
  return (
    <Stack
      align="center"
      justify="center"
      style={{ minHeight: '100vh', padding: '2rem' }}
    >
      <Alert color="red" title="出错了" style={{ maxWidth: 480 }}>
        页面遇到意外错误，已记录到监控系统。刷新页面试试？
      </Alert>
      <Button onClick={() => window.location.reload()}>刷新页面</Button>
    </Stack>
  )
}
