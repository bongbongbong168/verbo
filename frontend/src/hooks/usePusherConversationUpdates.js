import { useEffect } from 'react'
import Pusher from 'pusher-js'

const key = import.meta.env.VITE_PUSHER_APP_KEY
const cluster = import.meta.env.VITE_PUSHER_APP_CLUSTER || 'mt1'
const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/* Whether the live channel is actually subscribed right now. Pages read this
   to decide whether they need their own fallback poll: a missing key, a
   refused /broadcasting/auth or a dropped socket all leave it false, and chat
   must still arrive — just a few seconds later instead of instantly. */
let connected = false

export function isRealtimeConnected() {
  return connected
}

function setConnected(next) {
  if (connected === next) return
  connected = next
  window.dispatchEvent(new CustomEvent('verbo:realtime-state', { detail: { connected } }))
}

function announce(detail) {
  window.dispatchEvent(new CustomEvent('verbo:conversation-updated', { detail }))
}

/**
 * One private Pusher subscription per signed-in account.
 *
 * Broadcast payloads contain only a conversation id and change type. The
 * receiver fetches the actual message from Verbo's authenticated API, keeping
 * chat text and attachment metadata off the realtime provider.
 */
export default function usePusherConversationUpdates(token, userId) {
  useEffect(() => {
    if (!token || !userId || !key || !apiUrl) {
      setConnected(false)
      return undefined
    }

    const client = new Pusher(key, {
      cluster,
      forceTLS: true,
      channelAuthorization: {
        endpoint: `${apiUrl}/broadcasting/auth`,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      },
    })
    const name = `private-users.${userId}`
    const channel = client.subscribe(name)
    let subscribedOnce = false

    channel.bind('pusher:subscription_succeeded', () => {
      setConnected(true)
      /* Anything sent while the socket was down was never delivered, so a
         resubscribe is treated as "something may have changed everywhere". */
      if (subscribedOnce) announce({ conversation_id: null, change: 'resync' })
      subscribedOnce = true
    })
    channel.bind('pusher:subscription_error', (status) => {
      setConnected(false)
      // Loud on purpose: a refused subscription looks exactly like a quiet
      // chat, which is how this went unnoticed before.
      console.warn('Live messages unavailable: channel subscription refused', status)
    })
    const onState = ({ current }) => {
      if (current !== 'connected') setConnected(false)
      else if (channel.subscribed) setConnected(true)
    }
    client.connection.bind('state_change', onState)
    channel.bind('conversation.changed', announce)

    return () => {
      channel.unbind_all()
      client.connection.unbind('state_change', onState)
      client.unsubscribe(name)
      client.disconnect()
      setConnected(false)
    }
  }, [token, userId])
}
