import userSchema from "../../../schema/user";
import { hashPassword, verifyPassword } from "../../../helper/helperPassword";
import { emitToServerPeers } from "../../../helper/helperSocket";
import { emitToUsers } from "../../../helper/helperMessage";

// The "My Account" page: read the account, change the username or e-mail,
// change the password. Every change needs the current password, like Discord.
// Errors come back as { error, code, field } so the form can show them in
// place; `code` is stable for the client to translate, `error` is readable.

const USERNAME = /^[^@#:`]{2,32}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 128

const currentUser = (req:any) => {
	const token = req.headers.authorization
	return token ? userSchema.findOne({ token }) : null
}

const toAccount = (user:any) => ({
	id: user._id.toString(),
	username: user.username,
	code: user.code,
	email: user.email,
})

const fail = (res:any, status:number, code:string, error:string, field?:string) => res.status(status).json({ error, code, field })

const accountGet = async (req:any, res:any) => {
	try {
		const user:any = await currentUser(req)
		if(!user) return fail(res, 401, "sessionNotFound", "Session not found.")
		res.status(200).json(toAccount(user))
	} catch (error) {
		console.error(error)
		fail(res, 400, "accountLoadFailed", "Could not load the account.")
	}
}

const accountPut = async (req:any, res:any) => {
	const body = req.body || {}
	try {
		const user:any = await currentUser(req)
		if(!user) return fail(res, 401, "sessionNotFound", "Session not found.")
		if(typeof body.password !== "string" || !(await verifyPassword(body.password, user.password)))
			return fail(res, 400, "wrongPassword", "Wrong password.", "password")

		const update:any = {}
		if(body.username !== undefined){
			const username = String(body.username).replace(/\s+/g, " ").trim()
			if(!USERNAME.test(username))
				return fail(res, 400, "invalidUsername", "Username must be 2-32 characters and must not contain @ # : `.", "username")
			if(username !== user.username){
				if(await userSchema.exists({ username, _id: { $ne: user._id } }))
					return fail(res, 409, "usernameTaken", "This username is taken.", "username")
				update.username = username
			}
		}
		if(body.email !== undefined){
			const email = String(body.email).trim()
			if(!EMAIL.test(email) || email.length > 254) return fail(res, 400, "invalidEmail", "Enter a valid e-mail address.", "email")
			if(email !== user.email){
				if(await userSchema.exists({ email, _id: { $ne: user._id } }))
					return fail(res, 409, "emailTaken", "This e-mail address is registered to another account.", "email")
				update.email = email
			}
		}

		if(Object.keys(update).length > 0) await userSchema.updateOne({ _id: user._id }, { $set: update })
		const account = toAccount({ ...user.toObject(), ...update })
		res.status(200).json(account)

		// Everyone who may show the old name: our other tabs, friends and server members
		if(update.username){
			const io = req.app.get("io")
			const rawSockets:any = await io.fetchSockets()
			rawSockets.forEach((socket:any) => {
				if(socket.handshake.auth.userId === account.id) socket.handshake.auth.name = account.username
			})
			const payload = { id: account.id, name: account.username, code: account.code }
			const friendIds = (user.friends || []).map((id:any) => id.toString())
			await emitToUsers(io, [account.id, ...friendIds], "userUpdated", payload)
			await emitToServerPeers(io, account.id, "userUpdated", payload)
		}
	} catch (error) {
		console.error(error)
		if(!res.headersSent) fail(res, 400, "accountUpdateFailed", "Could not update the account.")
	}
}

const passwordPut = async (req:any, res:any) => {
	const body = req.body || {}
	try {
		const user:any = await currentUser(req)
		if(!user) return fail(res, 401, "sessionNotFound", "Session not found.")
		if(typeof body.password !== "string" || !(await verifyPassword(body.password, user.password)))
			return fail(res, 400, "wrongCurrentPassword", "Current password is wrong.", "password")
		const next = body.newPassword
		if(typeof next !== "string" || next.length < MIN_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH)
			return fail(res, 400, "passwordTooShort", `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, "newPassword")

		// Other devices are logged out; this one keeps its session
		const token = req.headers.authorization
		await userSchema.updateOne({ _id: user._id }, { $set: { password: await hashPassword(next), token: [token] } })
		res.status(200).json({ status: "Success" })

		const io = req.app.get("io")
		const rawSockets:any = await io.fetchSockets()
		rawSockets.forEach((socket:any) => {
			if(socket.handshake.auth.userId === user._id.toString() && socket.handshake.auth.token !== token)
				socket.emit("sessionEnded")
		})
	} catch (error) {
		console.error(error)
		if(!res.headersSent) fail(res, 400, "passwordChangeFailed", "Could not change the password.")
	}
}

export { accountGet, accountPut, passwordPut }
