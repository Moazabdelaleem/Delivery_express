const jwt = require('jsonwebtoken');

// In-memory buffer: userId -> Array<{ event, payload, timestamp }>
const pendingUserEventsMap = new Map();
const MAX_BUFFER_SIZE = 20;
const MAX_BUFFER_AGE_MS = 15 * 60 * 1000; // 15 minutes TTL

console.warn('⚠️ [SOCKET REPLAY NOTICE] Socket.io missed-event replay buffer initialized in-memory (max 20 events/user, 15m TTL). Note: Buffered events are in-memory and will NOT survive server restarts.');

function bufferEvent(userId, eventName, payload) {
  if (!userId) return;
  const strUserId = String(userId);
  const now = Date.now();

  let userEvents = pendingUserEventsMap.get(strUserId) || [];
  // Filter out expired events (> 15 minutes old)
  userEvents = userEvents.filter(e => now - e.timestamp < MAX_BUFFER_AGE_MS);

  userEvents.push({ event: eventName, payload, timestamp: now });

  // Cap size at MAX_BUFFER_SIZE
  if (userEvents.length > MAX_BUFFER_SIZE) {
    userEvents = userEvents.slice(userEvents.length - MAX_BUFFER_SIZE);
  }

  pendingUserEventsMap.set(strUserId, userEvents);
}

function replayPendingEvents(socket, userId) {
  if (!userId) return;
  const strUserId = String(userId);
  const userEvents = pendingUserEventsMap.get(strUserId);

  if (userEvents && userEvents.length > 0) {
    console.log(`🔄 Replaying ${userEvents.length} missed event(s) for user ${strUserId} on socket ${socket.id}`);
    const now = Date.now();
    for (const item of userEvents) {
      if (now - item.timestamp < MAX_BUFFER_AGE_MS) {
        socket.emit(item.event, item.payload);
      }
    }
    // Clear buffer after successful replay to reconnecting client
    pendingUserEventsMap.delete(strUserId);
  }
}

function extractUserId(socket) {
  try {
    const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
    if (token) {
      const secret = process.env.JWT_SECRET;
      const decoded = jwt.verify(token, secret);
      if (decoded && decoded.id) return String(decoded.id);
    }
  } catch (err) {
    // Fallback if token is expired or not a JWT
  }

  const rawId = socket.handshake?.auth?.userId ||
                socket.handshake?.auth?.user_id ||
                socket.handshake?.query?.userId ||
                socket.handshake?.query?.user_id;

  return rawId ? String(rawId) : null;
}

module.exports = {
  bufferEvent,
  replayPendingEvents,
  extractUserId
};
