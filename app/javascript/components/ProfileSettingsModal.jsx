import { Modal, Stack, TextInput, FileButton, Button, Group, Avatar, Anchor, Text } from '@mantine/core'
import { useForm, usePage, router } from '@inertiajs/react'
import { useEffect, useState } from 'react'

const NAME_RE = /^[A-Za-z0-9\u4e00-\u9fff]+$/

export default function ProfileSettingsModal({ opened, onClose }) {
  const { current_user } = usePage().props
  const form = useForm({ name: current_user.name, avatar: null })

  const [previewUrl, setPreviewUrl] = useState(current_user.avatar_url || null)

  useEffect(() => {
    if (!form.data.avatar) {
      setPreviewUrl(current_user.avatar_url || null)
      return
    }
    const url = URL.createObjectURL(form.data.avatar)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [form.data.avatar, current_user.avatar_url])

  const clientNameError = (() => {
    const v = form.data.name || ''
    if (v.length === 0) return '昵称不能为空'
    if (v.length > 30) return '昵称不能超过 30 字符'
    if (!NAME_RE.test(v)) return '只能包含字母、数字或中文'
    return null
  })()

  function submit(e) {
    e.preventDefault()
    if (clientNameError) return
    form.patch('/profile', {
      forceFormData: true,
      preserveScroll: true,
      onSuccess: onClose,
    })
  }

  function removeAvatar() {
    router.delete('/profile/avatar', { preserveScroll: true })
  }

  const showRemoveAvatar = current_user.has_custom_avatar && !form.data.avatar

  return (
    <Modal opened={opened} onClose={onClose} title="个人设置" centered>
      <form onSubmit={submit}>
        <Stack>
          <Stack align="center" gap={6}>
            <FileButton
              accept="image/jpeg,image/png,image/webp"
              onChange={(f) => form.setData('avatar', f)}
            >
              {(props) => (
                <Avatar
                  {...props}
                  src={previewUrl}
                  size={96}
                  radius="xl"
                  style={{ cursor: 'pointer' }}
                  aria-label="点击更换头像"
                >
                  {current_user.name?.[0]?.toUpperCase()}
                </Avatar>
              )}
            </FileButton>
            <Text size="xs" c="dimmed">点击头像更换 (JPG/PNG/WebP, ≤5MB)</Text>
            {showRemoveAvatar && (
              <Anchor
                component="button"
                type="button"
                size="xs"
                c="dimmed"
                onClick={removeAvatar}
              >
                使用默认头像
              </Anchor>
            )}
            {form.errors.avatar && (
              <Text size="xs" c="red">{form.errors.avatar}</Text>
            )}
          </Stack>

          <TextInput
            label="昵称"
            value={form.data.name}
            onChange={(e) => form.setData('name', e.currentTarget.value)}
            error={form.errors.name || clientNameError}
            maxLength={30}
            required
          />

          <TextInput label="邮箱" value={current_user.email} readOnly disabled />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>取消</Button>
            <Button
              type="submit"
              loading={form.processing}
              disabled={Boolean(clientNameError)}
            >
              保存
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
