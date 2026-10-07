import { leaveVoiceRooms } from "../channel/leave";

// Runs on "disconnecting", while socket.rooms is still populated
export default async (io:any, socket:any)=>{
	const { userId, name, code } = socket.handshake.auth
	if(!userId) return

	await leaveVoiceRooms(io, socket)

	// The user may still be online in another tab
	const rawSockets:any = await io.fetchSockets()
	const stillOnline = rawSockets.some((s:any) => s.id !== socket.id && s.handshake.auth.userId === userId)
	if(stillOnline) return

	socket.broadcast.emit("friendLeft", {
		userId,
		name,
		code
	});
}
