import { usePage } from '@inertiajs/react'
import AdminShell from '../../components/admin/AdminShell'

export default function Dashboard() {
  const { url } = usePage()
  return (
    <AdminShell currentPath={url}>
      <div>Admin Dashboard (placeholder)</div>
    </AdminShell>
  )
}
