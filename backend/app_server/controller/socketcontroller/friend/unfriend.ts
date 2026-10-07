import userSchema from "../../../schema/user";
import { emitToUser } from "../../../helper/helperSocket";

export default async (io:any, socket:any, data:any)=>{
	const token = socket.handshake.auth.token
	if(!token || !data) return

	try {


	const me:any = await userSchema.findOne({token:{$elemMatch:{$eq:token}}})
	if(!me) return
	const otherId = data._id || data.userId
	const other:any = otherId
		? await userSchema.findById(otherId)
		: await userSchema.findOne({ username:data.name, code:data.code })
	if(!other || me._id.equals(other._id)) return

	await userSchema.updateOne({
		_id:me._id,
	},{
		$pull:{
			friends:other._id}
	})

	await userSchema.updateOne({
		_id:other._id,
	},{
		$pull:{
			friends:me._id}
	})
	const rawSockets:any = await io.fetchSockets()
	emitToUser(rawSockets, me._id, "friendUnFriend", { _id:other._id.toString() })
	emitToUser(rawSockets, other._id, "friendUnFriend", { _id:me._id.toString() })
	} catch (error) {
		console.error(error)

	}
}
