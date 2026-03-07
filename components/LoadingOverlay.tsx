import ActionModal from './ActionModal'

interface Props {
  message?: string
}

/**
 * A full-page modal overlay shown during long-running actions (e.g. registering,
 * saving teams).
 */
export default function LoadingOverlay({ message = 'Working...' }: Props) {
  return <ActionModal status="loading" title={message} />
}
