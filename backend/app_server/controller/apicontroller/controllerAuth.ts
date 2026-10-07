import { generateAccessToken } from "../../helper/helperToken";
import { generateRefreshToken } from "../../helper/helperToken";
import { UniqueId, UniqueName } from "../../helper/helperGetUniqueID";
import crypto from "crypto";
import serverSchema from "../../schema/server";
import userSchema from "../../schema/user";

const isFilled = (value: any) => typeof value === "string" && value.trim() !== "";

const loginPost = async (req: any, res: any) => {
  let data = req.body || {};
  if (!isFilled(data.email) || !isFilled(data.password))
    return res.status(400).json("login failed");

  try {
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

const logoutPost = async (req: any, res: any) => {
  const token: any = req.body.token || req.headers.authorization;
  try {
    if (token) await userSchema.updateOne({ token }, { $pull: { token } });
    res.status(200).json("You logged out successfully.");
  } catch (error) {
    console.error(error);
    res.status(400).json("logout failed");
  }
};

const registerPost = async (req: any, res: any) => {
  try {
    let data = req.body || {};
    if (
      !isFilled(data.username) ||
      !isFilled(data.email) ||
      !isFilled(data.password)
    )
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

    const defaultServer: any = await serverSchema.findOne({
      inviteCode: "rmll4nmu",
    });

    if (defaultServer) {
      user.servers.push(defaultServer._id);
    }

    // Save the user first so a failed registration (e.g. duplicate e-mail)
    // does not leave an orphan id inside the default server
    await user.save();

    if (defaultServer) {
      await serverSchema.updateOne(
        { _id: defaultServer._id },
        { $addToSet: { userIDs: user._id } }
      );
    }

    res.status(200).json("registered");
  } catch (error) {
    console.error(error);
    res.status(401).json("not registered");
  }
};

export { loginPost, logoutPost, registerPost };
