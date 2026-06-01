import { useMediaQuery } from '@mantine/hooks'

// 768px = 手机/平板分界，与 AppShell 导航抽屉折叠同线。
export const MOBILE_BREAKPOINT = 768

// getInitialValueInEffect:false → 首帧即按 matchMedia 取值，避免桌面→移动闪一下。
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`, false, {
    getInitialValueInEffect: false,
  }) ?? false
}
