import * as Sentry from '@sentry/react'
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { DatesProvider } from '@mantine/dates'
import 'dayjs/locale/zh-cn'
import '@mantine/core/styles.css'
import '../lib/pwa-register'  // 注册 SW(SW per-origin 全局生效,只调一次)
import '@mantine/notifications/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/charts/styles.css'
import AppShell from '../layouts/AppShell'
import { UndoStackProvider } from '../hooks/useUndoStack'
import ErrorFallback from '../components/ErrorFallback'

if (import.meta.env.VITE_SENTRY_DSN_FRONTEND) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN_FRONTEND,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_KAMAL_VERSION,
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    beforeSend(event) {
      if (event.request?.data?.content) {
        delete event.request.data.content
      }
      return event
    },
  })
}

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: '"LXGW WenKai", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
})

createInertiaApp({
  resolve: name => {
    const pages = import.meta.glob(
      ['../pages/**/*.jsx', '!../pages/**/__tests__/**', '!../pages/**/*.test.jsx'],
      { eager: true }
    )
    const page = pages[`../pages/${name}.jsx`]
    if (!page.default.layout) {
      page.default.layout = (page) => <AppShell>{page}</AppShell>
    }
    return page
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <Sentry.ErrorBoundary fallback={<ErrorFallback />} showDialog={false}>
        <MantineProvider theme={theme}>
          <DatesProvider settings={{ locale: 'zh-cn', firstDayOfWeek: 1 }}>
            <ModalsProvider>
              <Notifications />
              <UndoStackProvider>
                <App {...props} />
              </UndoStackProvider>
            </ModalsProvider>
          </DatesProvider>
        </MantineProvider>
      </Sentry.ErrorBoundary>
    )
  },
})
