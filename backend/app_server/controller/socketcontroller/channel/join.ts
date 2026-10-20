import userSchema from "../../../schema/user";
import serverSchema from "../../../schema/server";
import channelSchema from "../../../schema/channel";
import { isId } from "../../../helper/helperMessage";
import { broadcastVoiceChannel, emitToServerMembers, isServerMember } from "../../../helper/helperSocket";
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
	// The channel may have been deleted while the client still shows it
	if(!isId(data.channelID)) return
	const channel = await channelSchema.exists({ _id: data.channelID, serverID: String(data.serverID), type: "voice" })
	if(!channel) return

	const rawRoomName =`server-${data.serverID}-${data.channelID}`
	if(socket.rooms.has(rawRoomName)) return

	await leaveVoiceRooms(io, socket)
	socket.join(rawRoomName)
	socket.data.selfMute = !!data.selfMute
	socket.data.selfDeaf = !!data.selfDeaf

	// The newcomer opens one WebRTC connection to every socket already in the channel
	const members:any = await io.in(rawRoomName).fetchSockets()
	socket.emit("voiceChannelMembers", {
		serverID:data.serverID,
		channelID:data.channelID,
		members:members
			.filter((member:any) => member.id !== socket.id)
			.map((member:any) => ({ socketId:member.id, userId:member.handshake.auth.userId })),
	})

	await emitToServerMembers(io, data.serverID, "joinUserVoiceChannelInChannel", {
		_id:user[0]._id.toString(),
		username:user[0].username,
		code:user[0].code,
		serverID:data.serverID,
		channelID:data.channelID,
		streaming:false,
		selfMute:socket.data.selfMute,
		selfDeaf:socket.data.selfDeaf,
	})
	await broadcastVoiceChannel(io, data.serverID, data.channelID)
	} catch (error) {
		console.error(error)

	}
}
