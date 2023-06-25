import { generateAccessToken } from "../../helper/helperToken";
import { generateRefreshToken } from "../../helper/helperToken";
import { UniqueId, UniqueName } from "../../helper/helperGetUniqueID";
import crypto from "crypto";
import serverSchema from "../../schema/server";
import userSchema from "../../schema/user";

const loginPost = async (req: any, res: any) => {
  let data = req.body;
  const token = generateAccessToken({});
  const filter = {
    email: data.email,
    password: crypto.createHash("md5").update(data.password).digest("hex"),
  };

  const update = {
    $push: {
      token,
    },
  };
  try {
    var user: any = await userSchema.findOneAndUpdate(filter, update);
    if (user) {
      res.status(200).json([
        { type: "username", value: user.username },
        { type: "email", value: user.email },
        { type: "code", value: user.code },
        { type: "friends", value: user.friends },
        { type: "blocked", value: user.blocked },
        { type: "request", value: user.request },
        { type: "token", value: token },
      ]);
    } else {
      res.status(401).json("login failed");
    }
  } catch (error: any) {
    res.status(400).json("login failed");
    console.error("login failed", error.name);
  }
};

const logoutPost = (req: any, res: any) => {
  const refreshToken: any = req.body.token;
  // refreshTokens = refreshTokens.filter((token) => token !== refreshToken)
  res.status(200).json("You logged out successfully.");
};

const registerPost = async (req: any, res: any) => {
  try {
    let data = req.body;
    if (Object.values(data).length < 3)
      return res.status(400).send({ error: "no data" });
    var user = new userSchema({
      username: data.username,
      email: data.email,
      password: crypto.createHash("md5").update(data.password).digest("hex"),
      code: UniqueId(),
      friends: [],
      blocked: [],
      request: [],
      state: "offline",
      token: [],
      servers: [],
    });

    const data2: any = await serverSchema.findOneAndUpdate(
      {
        inviteCode: "rmll4nmu",
      },
      {
        $push: {
          userIDs: user._id,
        },
      }
    );

    if (data2) {
      user.servers.push(data2._id);
    }

    user.save((err, user) => {
      console.error(err);
      err
        ? res.status(401).json("not registered")
        : res.status(200).json("registered");
    });
  } catch (error) {
    console.error(error);
  }
};

export { loginPost, logoutPost, registerPost };
