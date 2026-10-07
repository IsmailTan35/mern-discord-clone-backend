import messageSchema from '../../../schema/message';
import serverSchema from '../../../schema/server';
import { isServerMember } from '../../../helper/helperSocket';

export default async (io:any, socket:any, data:any)=>{
	if(!socket.handshake.auth.userId || !data || data.to) return
	if(typeof data.message !== "string" || data.message.trim() === "") return

	try {

	const isDirectMessage = data.receiver && !data.serverName && !data.channelName

	let server:any = null
	if(!isDirectMessage){
		server = await serverSchema.findById(data.serverName)
		if(!isServerMember(server, socket.handshake.auth.userId)) return
	}

	let rawSockets =await io.fetchSockets()

	const messageSch = new messageSchema({
		sender:socket.handshake.auth.userId,
		receiver:data.receiver,
		message:data.message,
		serverName:data.serverName,
		channelName:data.channelName
	})
	messageSch.readers.push(socket.handshake.auth.userId)
	const msg:any = await messageSch.save()

	const payload = [{
		_id:msg._id.toString(),
		receiver:msg.receiver,
		sender:msg.sender,
		message:msg.message,
		serverName:msg.serverName,
		channelName:msg.channelName,
		messageId:msg._id.toString(),
		timestamps:msg.timestamps,
	}]

	if(isDirectMessage){
		const sockets = rawSockets.filter((s:any)=>s.handshake.auth.userId==socket.handshake.auth.userId || s.handshake.auth.userId==data.receiver)
		sockets.map((s:any)=>{
			s.emit("newMessage",payload)
		})
	}
	else{
		rawSockets.map((socket:any)=>{
			if(isServerMember(server, socket.handshake.auth.userId)){
				socket.emit("newMessage",payload)
			}
		})
	}
	} catch (error) {
		console.error(error)

	}
}
