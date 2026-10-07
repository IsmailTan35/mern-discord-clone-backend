import messageSchema from "../../../schema/message";
import userSchema from "../../../schema/user";

export default async (req:any,res:any) => {
	const token = req.headers.authorization
	const friendId = req.query.id
	if(!token) return res.status(401).json("You are not authenticated!")
	if(!friendId) return res.status(400).json("id is required")
	try {
		const user:any = await userSchema.findOne({token:{$in:[token]}})
		if(!user) return res.status(401).json("You are not authenticated!")

		const userId = user._id.toString()
		const messages = await messageSchema.find({
			$or:[
				{sender:userId,receiver:friendId},
				{sender:friendId,receiver:userId}
			]
		}).sort({timestamps:1})
		res.status(200).json(messages)

	} catch (error) {
		res.status(400).json("")
		console.error(error)
	}
}
