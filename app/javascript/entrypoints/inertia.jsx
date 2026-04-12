import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import AppLayout from '../layouts/AppLayout'

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
})

createInertiaApp({
  resolve: name => {
    const pages = import.meta.glob('../pages/**/*.jsx', { eager: true })
    const page = pages[`../pages/${name}.jsx`]
    if (!page.default.layout) {
      page.default.layout = (page) => <AppLayout>{page}</AppLayout>
    }
    return page
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <MantineProvider theme={theme}>
        <App {...props} />
      </MantineProvider>
    )
  },
})
