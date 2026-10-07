import { ObjectId } from "mongodb";
import userSchema from "../../../schema/user";
export default async (io:any, socket:any, data:any)=>{
	if(!data || !ObjectId.isValid(data.userId)) return
	const { userId } = data
	try {
	const res:any = await userSchema.findOne({_id:new ObjectId(userId)})
	if(!res) return
	socket.emit("newUserInfo",{
		id:res._id,
		name:res.username,
		code:res.code,
	})
	} catch (error) {
		console.error(error)

	}
}