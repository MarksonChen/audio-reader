import { useSession } from '../store/session'

export function Toast() {
  const toast = useSession((s) => s.toast)
  if (!toast) return null
  return (
    <div className="toast" role="status">
      {toast}
    </div>
  )
}
