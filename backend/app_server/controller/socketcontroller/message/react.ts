import messageSchema from '../../../schema/message';
import {
	conversationOfMessage,
	emitToUsers,
	getConversationMembers,
	isEmoji,
	isId,
} from '../../../helper/helperMessage';

// Discord's limit of different reactions on one message
const MAX_REACTIONS = 20

// Adds our reaction with this emoji, or takes it back if we already reacted.
// Each step is a single atomic update, so people reacting at the same moment
// do not overwrite each other.
export default async (io:any, socket:any, data:any) => {
	const userId = socket.handshake.auth.userId
	if(!userId || !data || !isId(data.messageId) || !isEmoji(data.emoji)) return
	const { emoji } = data

	try {
		const msg:any = await messageSchema.findById(data.messageId)
		if(!msg) return
		const memberIds = await getConversationMembers(conversationOfMessage(msg), userId, 10000)
		if(!memberIds) return

		const existing = (msg.reactions || []).find((reaction:any) => reaction.emoji === emoji)
		if(existing && (existing.users || []).includes(userId)){
			await messageSchema.updateOne({ _id: msg._id, "reactions.emoji": emoji }, { $pull: { "reactions.$.users": userId } })
			await messageSchema.updateOne({ _id: msg._id }, { $pull: { reactions: { users: { $size: 0 } } } })
		} else {
			if(!existing && (msg.reactions || []).length >= MAX_REACTIONS) return
			const added = await messageSchema.updateOne({ _id: msg._id, "reactions.emoji": emoji }, { $addToSet: { "reactions.$.users": userId } })
			if(added.matchedCount === 0){
				const pushed = await messageSchema.updateOne(
					{ _id: msg._id, "reactions.emoji": { $ne: emoji } },
					{ $push: { reactions: { emoji, users: [userId] } } }
				)
				// Someone else added this emoji in the meantime: join theirs
				if(pushed.matchedCount === 0)
					await messageSchema.updateOne({ _id: msg._id, "reactions.emoji": emoji }, { $addToSet: { "reactions.$.users": userId } })
			}
		}

		const updated:any = await messageSchema.findById(msg._id, { reactions: 1 })
		await emitToUsers(io, memberIds, "messageUpdated", { _id: msg._id.toString(), reactions: updated ? updated.reactions : [] })
	} catch (error) {
		console.error(error)
	}
}
