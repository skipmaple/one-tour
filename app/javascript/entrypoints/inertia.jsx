import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { DatesProvider } from '@mantine/dates'
import 'dayjs/locale/zh-cn'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/dates/styles.css'
import AppLayout from '../layouts/AppLayout'
import { UndoStackProvider } from '../hooks/useUndoStack'

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
      page.default.layout = (page) => <AppLayout>{page}</AppLayout>
    }
    return page
  },
  setup({ el, App, props }) {
    createRoot(el).render(
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
    )
  },
})
