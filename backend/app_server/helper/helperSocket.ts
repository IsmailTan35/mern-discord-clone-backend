import serverSchema from "../schema/server";
import { ObjectId } from "mongodb";

// Member ids are stored as ObjectIds while socket auth holds plain strings,
// so they have to be compared as strings
const getMemberIds = (server:any) => (server.userIDs || []).map((id:any) => id.toString())

const isServerMember = (server:any, userId:any) => !!server && getMemberIds(server).includes(String(userId))

// Servers created before `ownerID` existed belong to their first member, the creator
const getServerOwnerId = (server:any) => {
	if(!server) return null
	if(server.ownerID) return String(server.ownerID)
	const [first] = getMemberIds(server)
	return first || null
}

const isServerOwner = (server:any, userId:any) => !!userId && getServerOwnerId(server) === String(userId)

const emitToUser = (rawSockets:any, userId:any, event:string, payload?:any) => {
	rawSockets.forEach((socket:any) => {
		if(socket.handshake.auth.userId === String(userId)) socket.emit(event, payload)
	})
}

// Speaking updates arrive several times a second, so they may reuse a member
// list that is a few seconds old instead of querying the database every time
const memberCache = new Map<string, { ids: string[]; at: number }>()

const getServerMemberIds = async (serverID:any, maxAgeMs = 0) => {
	const key = String(serverID)
	const cached = memberCache.get(key)
	if(cached && Date.now() - cached.at <= maxAgeMs) return cached.ids
	const server:any = await serverSchema.findById(serverID)
	if(!server) return null
	const ids = getMemberIds(server)
	memberCache.set(key, { ids, at: Date.now() })
	return ids
}

const emitToServerMembers = async (io:any, serverID:any, event:string, payload:any, maxAgeMs = 0) => {
	const memberIds = await getServerMemberIds(serverID, maxAgeMs)
	if(!memberIds) return
	const rawSockets:any = await io.fetchSockets()
	rawSockets.forEach((socket:any) => {
		if(memberIds.includes(socket.handshake.auth.userId)) socket.emit(event, payload)
	})
}

// Every user id that has at least one connected (configured) socket
const getOnlineUserIds = (rawSockets:any) =>
	new Set<string>(rawSockets.map((socket:any) => socket.handshake.auth.userId).filter(Boolean))

// Sends an event to everyone who shares at least one server with the user,
// e.g. so their server member lists can show the user going online or offline
const emitToServerPeers = async (io:any, userId:any, event:string, payload:any) => {
	if(!ObjectId.isValid(userId)) return
	// userIDs is an untyped array, so match both ways an id may be stored
	const servers:any = await serverSchema.find(
		{ userIDs: { $in: [new ObjectId(userId), String(userId)] } },
		{ userIDs: 1 }
	)
	const peerIds = new Set<string>(servers.flatMap(getMemberIds))
	if(peerIds.size === 0) return
	const rawSockets:any = await io.fetchSockets()
	rawSockets.forEach((socket:any) => {
		if(peerIds.has(socket.handshake.auth.userId)) socket.emit(event, payload)
	})
}

// Who is in a voice channel right now, from the sockets in its room. One entry
// per user, even if they are connected from several tabs.
const getVoiceChannelUsers = (rawSockets:any, serverID:any, channelID:any) => {
	const room = `server-${serverID}-${channelID}`
	const users = new Map<string, any>()
	rawSockets.forEach((socket:any) => {
		const { name, code, userId } = socket.handshake.auth
		if(!userId || !socket.rooms.has(room) || users.has(userId)) return
		const data = socket.data || {}
		users.set(userId, {
			_id: userId,
			username: name,
			code,
			streaming: !!data.screenSharing,
			selfMute: !!data.selfMute,
			selfDeaf: !!data.selfDeaf,
		})
	})
	return [...users.values()]
}

// Sends the full member list of a voice channel to everyone in the server.
// Clients replace their copy with it, so a join or leave they missed (e.g.
// while reconnecting) is corrected by the next change.
const broadcastVoiceChannel = async (io:any, serverID:any, channelID:any) => {
	const memberIds = await getServerMemberIds(serverID)
	if(!memberIds) return
	const rawSockets:any = await io.fetchSockets()
	const payload = { serverID, channelID, users: getVoiceChannelUsers(rawSockets, serverID, channelID) }
	rawSockets.forEach((socket:any) => {
		if(memberIds.includes(socket.handshake.auth.userId)) socket.emit("voiceChannelUsers", payload)
	})
}

// The voice channel room a socket is in, if any (`server-<serverID>-<channelID>`)
const getVoiceRoom = (socket:any) => {
	const room = [...socket.rooms].find((name:string) => name.startsWith("server-"))
	if(!room) return null
	const [, serverID, channelID] = room.split("-")
	return { room, serverID, channelID }
}

const leaveRooms = (socket:any, prefix:string) => {
	[...socket.rooms]
		.filter((room:string) => room.startsWith(prefix))
		.forEach((room:string) => socket.leave(room))
}

export {
	isServerMember,
	getServerOwnerId,
	isServerOwner,
	getServerMemberIds,
	emitToUser,
	emitToServerMembers,
	emitToServerPeers,
	getOnlineUserIds,
	getVoiceChannelUsers,
	broadcastVoiceChannel,
	getVoiceRoom,
	leaveRooms
}
