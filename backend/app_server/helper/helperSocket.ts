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

const emitToServerMembers = async (io:any, serverID:any, event:string, payload:any) => {
	const server:any = await serverSchema.findById(serverID)
	if(!server) return
	const memberIds = getMemberIds(server)
	const rawSockets:any = await io.fetchSockets()
	rawSockets.forEach((socket:any) => {
		if(memberIds.includes(socket.handshake.auth.userId)) socket.emit(event, payload)
	})
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
	leaveRooms
}
