import  jwt from 'jsonwebtoken'
import crypto from 'crypto'

// Users are looked up by their token, so every token must be unique. Without
// the user id and a random jwtid, two logins in the same second produced the
// very same token and the second user was taken for the first one.
const generateAccessToken = (user: { id?: any; isAdmin?: any; }) =>{
    return jwt.sign({ id: user.id, isAdmin: user.isAdmin }, process.env.ACCESS_TOKEN_SECRET as string, {
        expiresIn: "999days",
        jwtid: crypto.randomUUID(),
    })
}

const generateRefreshToken = (user: { id: any; isAdmin: any }) =>{
    return jwt.sign({ id: user.id, isAdmin: user.isAdmin }, process.env.REFRESH_TOKEN_SECRET as string, {
        expiresIn: "10m",
        jwtid: crypto.randomUUID(),
    })
}

export {
    generateAccessToken,
    generateRefreshToken
}
