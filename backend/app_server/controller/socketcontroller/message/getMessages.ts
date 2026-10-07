import messageSchema from '../../../schema/message';
import serverSchema from '../../../schema/server';
import { isServerMember } from '../../../helper/helperSocket';

export default async (io:any, socket:any, data:any)=>{

	if(!socket.handshake.auth.userId || !data) return
	let messages:any= []
	try {


	if(data.receiver){
		 messages = await messageSchema.find({
			$or:[
				{
					sender:socket.handshake.auth.userId,
					receiver:data.receiver,
				},
				{
					sender:data.receiver,
					receiver:socket.handshake.auth.userId,
				}
			]
		}).sort({timestamps:1})
	}
	else{
		const server:any = await serverSchema.findById(data.serverName)
		if(!isServerMember(server, socket.handshake.auth.userId)) return

		 messages = await messageSchema.aggregate(
			[
				{
					$match:{
						$and:[
							{
								serverName:data.serverName,
							},
							{
								channelName:data.channelName,
							}
						]
					}
				},
				{
					$sort:{
						timestamps:1
					}
				}
			]
		 )
	}
	let rawSockets =await io.fetchSockets()
	const sockets = rawSockets.filter((s:any)=>s.handshake.auth.userId==socket.handshake.auth.userId)
	sockets.map((s:any)=>{
		s.emit("allMessage",messages)
	})
	} catch (error) {
		console.error(error)

	}
}
