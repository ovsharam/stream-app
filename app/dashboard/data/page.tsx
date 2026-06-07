import { redirect } from 'next/navigation'

/** Legacy path — ops console lives at /measure, not inside Notch. */
export default function DashboardDataRedirect() {
  redirect('/measure')
}
