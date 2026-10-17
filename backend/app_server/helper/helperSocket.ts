import serverSchema from "../schema/server";

// Member ids are stored as ObjectIds while socket auth holds plain strings,
// so they have to be compared as strings
const getMemberIds = (server:any) => (server.userIDs || []).map((id:any) => id.toString())

const isServerMember = (server:any, userId:any) => !!server && getMemberIds(server).includes(String(userId))

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
	emitToUser,
	emitToServerMembers,
	getVoiceRoom,
	leaveRooms
}
