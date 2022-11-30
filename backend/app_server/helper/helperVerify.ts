import jwt from "jsonwebtoken"

const verifyPost = (req:any,res:any,next:any) => {
  const token = req.body.userAccessToken
  if (token) {
    jwt.verify(token, "process.env.ACCESS_TOKEN_SECRET", (err:any, userToken:any) => {
      if (err) {
        return res.status(403).json("Token is not valid!")
      }
      req.userToken = userToken
      res.status(200).json("Token is valid!")
    })
  } else {
    res.status(401).json("You are not authenticated!")
  }
}

export {
  verifyPost
}