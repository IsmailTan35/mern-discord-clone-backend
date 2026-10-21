import {
	conversationOfRequest,
	emitToUsers,
	getConversationMembers,
} from '../../../helper/helperMessage';

// Clients send this every few seconds while typing; anything faster is dropped
const MIN_INTERVAL_MS = 1000

// "<name> is typing..." for the others in the conversation
export default async (io:any, socket:any, data:any) => {
	const { userId, name } = socket.handshake.auth
	if(!userId || !data) return
	const now = Date.now()
	if(socket.data.lastTypingAt && now - socket.data.lastTypingAt < MIN_INTERVAL_MS) return
	socket.data.lastTypingAt = now

	try {
		const isDirectMessage = !!data.receiver && !data.serverName
		const conversation = conversationOfRequest(isDirectMessage ? { receiver: data.receiver } : data, userId)
		const memberIds = await getConversationMembers(conversation, userId, 10000)
		if(!memberIds) return

		await emitToUsers(io, memberIds, "typing", {
			userId,
			name,
			receiver: isDirectMessage ? String(data.receiver) : null,
			serverName: isDirectMessage ? null : String(data.serverName),
			channelName: isDirectMessage ? null : String(data.channelName),
		}, userId)
	} catch (error) {
		console.error(error)
	}
}
