import formidable from "formidable";

import serverSchema from "../../../schema/server";
import channelSchema from "../../../schema/channel";
import userSchema from "../../../schema/user";
import path from "path";
import fs from "fs";

export default async (req: any, res: any) => {
  try {
    const io = req.app.get("io");
    const token = req.headers.authorization;
    const form = formidable({ multiples: true });
    form.parse(req, async (err: any, fields: any, files: any) => {
      // This callback runs outside the outer try/catch, so it needs its own
      try {
        if (err) return res.status(500).json({ error: "server not found" });

        const { serverName } = fields;
        if (!serverName || !token) return res.status(400).json("");

        const user: any = await userSchema.aggregate([
          {
            $match: {
              token: { $in: [token] },
            },
          },
        ]);
        if (user.length == 0) return res.sendStatus(401);
        const inviteCode =
          Math.random().toString(36).substring(2, 6) +
          Math.random().toString(36).substring(2, 6);

        const svSchema = new serverSchema({
          servername: serverName,
          inviteCode: inviteCode,
          userIDs: [user[0]._id],
        });

        if (files && files.serverPhoto && files.serverPhoto.filepath) {
          try {
            let newFileName = `${svSchema._id.toString()}.png`;
            let rawPath = path.join(
              path.resolve(),
              "backend/app_server/uploads/server"
            );
            // The uploads folder is gitignored, so it may not exist on a fresh deploy
            fs.mkdirSync(rawPath, { recursive: true });
            fs.copyFileSync(
              files.serverPhoto.filepath,
              path.join(rawPath, newFileName)
            );
            svSchema.serverpicture = newFileName;
          } catch (error) {
            if (error) console.error(error);
            svSchema.serverpicture = "";
          }
        }
        const chSchema1: any = new channelSchema({
          channelname: "general",
          type: "voice",
          locked: [],
          group: "Voice Channels",
        });

        const chSchema2: any = new channelSchema({
          channelname: "general",
          type: "text",
          locked: [],
          group: "Text Channels",
        });

        svSchema.channels = [chSchema1._id, chSchema2._id];
        chSchema1.serverID = svSchema._id;
        chSchema2.serverID = svSchema._id;

        await svSchema.save();
        await chSchema1.save();
        await chSchema2.save();

        await userSchema.findOneAndUpdate(
          {
            _id: user[0]._id,
          },
          {
            $push: {
              servers: svSchema._id,
            },
          },
          {
            new: true,
          }
        );

        res.status(200).json({
          serverId: svSchema._id,
          servername: svSchema.servername,
          serverpicture: svSchema.serverpicture,
          userIDs: svSchema.userIDs,
        });

        const rawSockets: any = await io.fetchSockets();
        const sockets = rawSockets.filter(
          (socket: { handshake: { auth: { token: any } } }) =>
            socket.handshake.auth.token === token
        );

        sockets.forEach((socket: any) => {
          socket.emit("newServer", {
            _id: svSchema._id,
            servername: svSchema.servername,
            channels: svSchema.channels,
            userIDs: svSchema.userIDs,
            inviteCode: svSchema.inviteCode,
            serverpicture: svSchema.serverpicture,
          });
          socket.emit("newChannel", chSchema1);
          socket.emit("newChannel", chSchema2);
        });
      } catch (error) {
        console.error(error);
        if (!res.headersSent) res.status(400).json("");
      }
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(400).json("");
  }
};
