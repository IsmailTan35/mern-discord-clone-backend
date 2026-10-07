import { emitToServerMembers } from "../../../helper/helperSocket";

// Voice channel rooms are named `server-<serverID>-<channelID>`. Only those rooms
// are left here: the socket's own id room is needed for direct signalling.
const leaveVoiceRooms = async (io:any, socket:any) => {
	const { userId, name, code } = socket.handshake.auth
	const voiceRooms = [...socket.rooms].filter((room:string) => room.startsWith("server-"))

	for (const room of voiceRooms) {
		const [, serverID, channelID] = room.split("-")
		socket.leave(room)
		await emitToServerMembers(io, serverID, "leftUserVoiceChannelInChannel", {
			_id: userId,
			username: name,
			code,
			serverID,
			channelID,
		})
	}
}

export { leaveVoiceRooms }

export default async (io:any, socket:any, data:any)=>{
	await leaveVoiceRooms(io, socket)
	socket.emit("closeStreamDevices")
}
