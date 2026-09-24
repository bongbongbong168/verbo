import { useEffect } from 'react'
import Pusher from 'pusher-js'

const key = import.meta.env.VITE_PUSHER_APP_KEY
const cluster = import.meta.env.VITE_PUSHER_APP_CLUSTER || 'mt1'
const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * One private Pusher subscription per signed-in account.
 *
 * Broadcast payloads contain only a conversation id and change type. The
 * receiver fetches the actual message from Verbo's authenticated API, keeping
 * chat text and attachment metadata off the realtime provider.
 */
export default function usePusherConversationUpdates(token, userId) {
  useEffect(() => {
    if (!token || !userId || !key || !apiUrl) return undefined

    const client = new Pusher(key, {
      cluster,
      forceTLS: true,
      channelAuthorization: {
        endpoint: `${apiUrl}/broadcasting/auth`,
        headers: { Authorization: `Bearer ${token}` },
      },
    })
    const channel = client.subscribe(`private-users.${userId}`)
    const onConversationChanged = (detail) => {
      window.dispatchEvent(new CustomEvent('verbo:conversation-updated', { detail }))
    }

    channel.bind('conversation.changed', onConversationChanged)

    return () => {
      channel.unbind('conversation.changed', onConversationChanged)
      client.unsubscribe(`private-users.${userId}`)
      client.disconnect()
    }
  }, [token, userId])
}
