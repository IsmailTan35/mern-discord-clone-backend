import messageSchema from '../../../schema/message';
import {
	MAX_MESSAGE_LENGTH,
	conversationOfMessage,
	conversationOfRequest,
	emitToUsers,
	extractMentions,
	getConversationMembers,
	isId,
	toMessagePayload,
} from '../../../helper/helperMessage';
import { extractUrls, getLinkPreview } from '../../../helper/helperLinkPreview';

const sameConversation = (a:any, b:any) => JSON.stringify(a.serverName ? a : { users: [...a.users].sort() }) ===
	JSON.stringify(b.serverName ? b : { users: [...b.users].sort() })

// Fetched after the message is out, then sent as an update of it
const attachLinkPreviews = async (io:any, msg:any, memberIds:string[]) => {
	const urls = extractUrls(msg.message)
	if(urls.length === 0) return
	const embeds = (await Promise.all(urls.map(getLinkPreview))).filter(Boolean)
	if(embeds.length === 0) return
	await messageSchema.updateOne({ _id: msg._id }, { $set: { embeds } })
	await emitToUsers(io, memberIds, "messageUpdated", { _id: msg._id.toString(), embeds })
}

export default async (io:any, socket:any, data:any)=>{
	const userId = socket.handshake.auth.userId
	if(!userId || !data || data.to) return
	if(typeof data.message !== "string" || data.message.trim() === "") return
	if(data.message.length > MAX_MESSAGE_LENGTH) return

	try {
		const isDirectMessage = !!data.receiver && !data.serverName && !data.channelName
		const conversation = conversationOfRequest(isDirectMessage ? { receiver: data.receiver } : data, userId)
		const memberIds = await getConversationMembers(conversation, userId)
		if(!memberIds) return

		// A reply must point at a message of the same conversation
		let replyTo = null
		if(isId(data.replyTo)){
			const original:any = await messageSchema.findById(data.replyTo, { sender: 1, receiver: 1, serverName: 1, channelName: 1 })
			if(original && sameConversation(conversationOfMessage(original), conversation)) replyTo = original._id.toString()
		}

		const msg:any = await new messageSchema({
			sender:userId,
			receiver:isDirectMessage ? data.receiver : null,
			message:data.message,
			serverName:isDirectMessage ? null : data.serverName,
			channelName:isDirectMessage ? null : data.channelName,
			readers:[userId],
			replyTo,
			...extractMentions(data.message, memberIds, !isDirectMessage),
		}).save()

		await emitToUsers(io, memberIds, "newMessage", [toMessagePayload(msg)])
		await attachLinkPreviews(io, msg, memberIds)
	} catch (error) {
		console.error(error)
	}
}
