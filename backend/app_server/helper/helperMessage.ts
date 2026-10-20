import channelSchema from "../schema/channel";
import { getServerMemberIds } from "./helperSocket";

// Discord's limit for a normal message
const MAX_MESSAGE_LENGTH = 2000

const isId = (value:any) => typeof value === "string" && /^[0-9a-f]{24}$/i.test(value)

// A conversation is either a direct message between two users or a text
// channel of a server: { users: [a, b] } or { serverName, channelName }.
const conversationOfMessage = (msg:any) => msg.serverName
	? { serverName: String(msg.serverName), channelName: String(msg.channelName) }
	: { users: [String(msg.sender), String(msg.receiver)] }

// What a client sends: `receiver` for a direct message, otherwise the server
// and channel ids
const conversationOfRequest = (data:any, userId:any) => data && data.serverName
	? { serverName: String(data.serverName), channelName: String(data.channelName) }
	: { users: [String(userId), String(data && data.receiver)] }

// The user ids that can see a conversation, or null when it does not exist or
// `userId` is not part of it. Server member lists may be `maxAgeMs` old.
const getConversationMembers = async (conversation:any, userId:any, maxAgeMs = 0) => {
	const me = String(userId)
	if(conversation.serverName){
		if(!isId(conversation.serverName) || !isId(conversation.channelName)) return null
		const memberIds = await getServerMemberIds(conversation.serverName, maxAgeMs)
		if(!memberIds || !memberIds.includes(me)) return null
		const channel = await channelSchema.exists({
			_id: conversation.channelName,
			serverID: conversation.serverName,
			type: "text",
		})
		return channel ? memberIds : null
	}
	const users = conversation.users.map(String)
	if(!users.every(isId) || !users.includes(me)) return null
	return [...new Set(users)]
}

// Sends an event to every connected socket of the given users
const emitToUsers = async (io:any, userIds:string[], event:string, payload:any, exceptUserId?:string) => {
	const ids = new Set(userIds.map(String))
	if(exceptUserId) ids.delete(String(exceptUserId))
	const rawSockets:any = await io.fetchSockets()
	rawSockets.forEach((socket:any) => {
		if(ids.has(socket.handshake.auth.userId)) socket.emit(event, payload)
	})
}

const toMessagePayload = (msg:any) => ({
	_id: msg._id.toString(),
	messageId: msg._id.toString(),
	sender: msg.sender,
	receiver: msg.receiver,
	message: msg.message,
	serverName: msg.serverName,
	channelName: msg.channelName,
	timestamps: msg.timestamps,
	replyTo: msg.replyTo || null,
	mentions: msg.mentions || [],
	mentionEveryone: !!msg.mentionEveryone,
	reactions: msg.reactions || [],
	embeds: msg.embeds || [],
})

// Mentions are written as <@userId>; only people who can see the message count.
// @everyone and @here reach the whole server.
const extractMentions = (text:string, memberIds:string[], inServer:boolean) => {
	const ids = new Set<string>()
	const pattern = /<@([0-9a-f]{24})>/gi
	let match
	while((match = pattern.exec(text))){
		if(memberIds.includes(match[1])) ids.add(match[1])
	}
	return {
		mentions: [...ids],
		mentionEveryone: inServer && /(^|\s)@(everyone|here)(?![\w])/.test(text),
	}
}

// A single emoji (including skin tones, ZWJ sequences, flags and keycaps).
// Reactions accept nothing else.
const EMOJI_CHARS = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|⃣|[#*0-9])+$/u
const EMOJI_BASE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u
const isEmoji = (value:any) =>
	typeof value === "string" && value.length > 0 && value.length <= 32 &&
	EMOJI_CHARS.test(value) && EMOJI_BASE.test(value)

export {
	MAX_MESSAGE_LENGTH,
	isId,
	conversationOfMessage,
	conversationOfRequest,
	getConversationMembers,
	emitToUsers,
	toMessagePayload,
	extractMentions,
	isEmoji,
}
