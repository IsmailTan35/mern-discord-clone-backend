import channelSchema from "../../../schema/channel";
import serverSchema from "../../../schema/server";
import messageSchema from "../../../schema/message";
import { emitToServerMembers, isServerOwner } from "../../../helper/helperSocket";
import { isId } from "../../../helper/helperMessage";
import { leaveVoiceRooms } from "./leave";

// Creating, renaming and deleting channels. Only the server's owner may do
// this. Every handler answers through the socket.io acknowledgement:
// { ok: true, channel? } or { ok: false, error } with a message to show.

const MAX_NAME_LENGTH = 100
const GROUPS: Record<string, string> = { text: "Text Channels", voice: "Voice Channels" }

// Like Discord: text channel names are lower case with dashes, voice channel
// names are kept as typed
const normalizeName = (name: any, type: string) => {
	if (typeof name !== "string") return ""
	const trimmed = name.replace(/\s+/g, " ").trim()
	if (type === "voice") return trimmed.slice(0, MAX_NAME_LENGTH)
	return trimmed
		.toLocaleLowerCase("tr")
		.replace(/[^\p{L}\p{N}_ -]/gu, "")
		.replace(/[\s-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_NAME_LENGTH)
}

const reply = (ack: any, value: any) => {
	if (typeof ack === "function") ack(value)
}

const toClient = (channel: any) => ({
	_id: channel._id.toString(),
	channelname: channel.channelname,
	serverID: String(channel.serverID),
	group: channel.group,
	type: channel.type,
	locked: channel.locked || [],
	onlineUser: [],
})

// The server, if the socket's user owns it
const ownedServer = async (socket: any, serverID: any) => {
	if (!isId(serverID)) return null
	const server: any = await serverSchema.findById(serverID)
	return isServerOwner(server, socket.handshake.auth.userId) ? server : null
}

const createChannel = async (io: any, socket: any, data: any, ack: any) => {
	const type = data && data.type === "voice" ? "voice" : "text"
	const server = await ownedServer(socket, data && data.serverID)
	if (!server) return reply(ack, { ok: false, error: "Bu sunucuda kanal oluşturma yetkin yok." })
	const channelname = normalizeName(data.name, type)
	if (!channelname) return reply(ack, { ok: false, error: "Geçerli bir kanal adı gir." })

	const channel: any = await new channelSchema({
		channelname,
		type,
		group: GROUPS[type],
		serverID: server._id.toString(),
		locked: [],
	}).save()
	await serverSchema.updateOne({ _id: server._id }, { $push: { channels: channel._id } })

	const payload = toClient(channel)
	await emitToServerMembers(io, server._id.toString(), "newChannel", payload)
	reply(ack, { ok: true, channel: payload })
}

// The channel and its server, if the socket's user owns the server
const ownedChannel = async (socket: any, channelID: any) => {
	if (!isId(channelID)) return {}
	const channel: any = await channelSchema.findById(channelID)
	if (!channel) return {}
	const server = await ownedServer(socket, String(channel.serverID))
	return server ? { channel, server } : {}
}

const updateChannel = async (io: any, socket: any, data: any, ack: any) => {
	const { channel, server } = await ownedChannel(socket, data && data.channelID)
	if (!channel) return reply(ack, { ok: false, error: "Bu kanalı düzenleme yetkin yok." })
	const channelname = normalizeName(data.name, channel.type)
	if (!channelname) return reply(ack, { ok: false, error: "Geçerli bir kanal adı gir." })

	await channelSchema.updateOne({ _id: channel._id }, { $set: { channelname } })
	const payload = { _id: channel._id.toString(), serverID: server._id.toString(), channelname }
	await emitToServerMembers(io, server._id.toString(), "channelUpdated", payload)
	reply(ack, { ok: true, channel: payload })
}

const deleteChannel = async (io: any, socket: any, data: any, ack: any) => {
	const { channel, server } = await ownedChannel(socket, data && data.channelID)
	if (!channel) return reply(ack, { ok: false, error: "Bu kanalı silme yetkin yok." })
	const serverID = server._id.toString()
	const channelID = channel._id.toString()

	// Opening a server goes to one of its text channels, so keep at least one
	if (channel.type === "text") {
		const textChannels = await channelSchema.countDocuments({ serverID, type: "text" })
		if (textChannels <= 1) return reply(ack, { ok: false, error: "Sunucunun son metin kanalı silinemez." })
	}

	await channelSchema.deleteOne({ _id: channel._id })
	await serverSchema.updateOne({ _id: server._id }, { $pull: { channels: { $in: [channel._id, channelID] } } })
	await messageSchema.deleteMany({ serverName: serverID, channelName: channelID })

	// Everyone talking in a deleted voice channel is disconnected from it
	const room = `server-${serverID}-${channelID}`
	const inRoom: any = await io.in(room).fetchSockets()
	for (const member of inRoom) {
		await leaveVoiceRooms(io, member)
		member.emit("closeStreamDevices")
	}

	await emitToServerMembers(io, serverID, "channelDeleted", { _id: channelID, serverID })
	reply(ack, { ok: true })
}

const withErrors = (handler: any) => async (io: any, socket: any, data: any, ack: any) => {
	try {
		await handler(io, socket, data, ack)
	} catch (error) {
		console.error(error)
		reply(ack, { ok: false, error: "Bir hata oluştu, tekrar dene." })
	}
}

export default {
	create: withErrors(createChannel),
	update: withErrors(updateChannel),
	remove: withErrors(deleteChannel),
}
