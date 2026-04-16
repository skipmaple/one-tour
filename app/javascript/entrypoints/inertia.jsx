import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import AppLayout from '../layouts/AppLayout'

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
        <ModalsProvider>
          <Notifications />
          <App {...props} />
        </ModalsProvider>
      </MantineProvider>
    )
  },
})
