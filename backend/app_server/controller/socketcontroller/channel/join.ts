import userSchema from "../../../schema/user";
import serverSchema from "../../../schema/server";
import { emitToServerMembers, isServerMember } from "../../../helper/helperSocket";
import { leaveVoiceRooms } from "./leave";

export default async(io:any, socket:any, data:any)=>{
	const token = socket.handshake.auth.token
	if(!token || !data) return
	try {

	const user:any = await userSchema.aggregate([
		{$match:{
			token:{"$in":[token]
		}}
	}])

	if(!user || user.length===0) return

	const server:any = await serverSchema.findById(data.serverID)
	if(!isServerMember(server, user[0]._id)) return

	const rawRoomName =`server-${data.serverID}-${data.channelID}`
	if(socket.rooms.has(rawRoomName)) return

	await leaveVoiceRooms(io, socket)
	socket.join(rawRoomName)

	// The newcomer opens one WebRTC connection to every socket already in the channel
	const members:any = await io.in(rawRoomName).fetchSockets()
	socket.emit("voiceChannelMembers", {
		serverID:data.serverID,
		channelID:data.channelID,
		members:members.map((member:any) => member.id).filter((id:string) => id !== socket.id),
	})

	await emitToServerMembers(io, data.serverID, "joinUserVoiceChannelInChannel", {
		_id:user[0]._id.toString(),
		username:user[0].username,
		code:user[0].code,
		serverID:data.serverID,
		channelID:data.channelID,
	})
	} catch (error) {
		console.error(error)

	}
}
