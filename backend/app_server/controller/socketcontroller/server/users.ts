import userSchema from "../../../schema/user";
import serverSchema from "../../../schema/server";
import { ObjectId } from "mongodb";
import { getOnlineUserIds } from "../../../helper/helperSocket";

export default async (io: any, socket: any, data: any) => {
  const token = socket.handshake.auth.token;
  if (!token || !data || !ObjectId.isValid(data.serverId)) return;
  const { serverId } = data;
  try {
    // Only members of the server may list its users
    const res: any = await userSchema.aggregate([
      {
        $match: {
          token: {
            $elemMatch: {
              $eq: token,
            },
          },
          servers: {
            $in: [new ObjectId(serverId), serverId],
          },
        },
      },
    ]);
    if (res.length === 0) return;
    const users: any = await serverSchema.aggregate([
      {
        $match: {
          _id: new ObjectId(serverId),
        },
      },
      {
        $lookup: {
          from: "discordusers",
          let: { req: "$userIDs" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$req"],
                },
              },
            },
          ],
          as: "users",
        },
      },
      {
        $unwind: "$users",
      },
      {
        $replaceRoot: {
          newRoot: "$users",
        },
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: "$username",
          code: "$code",
        },
      },
    ]);
    const onlineIds = getOnlineUserIds(await io.fetchSockets());
    socket.emit(
      "serverUsers",
      users.map((user: any) => ({ ...user, online: onlineIds.has(String(user.id)) }))
    );
  } catch (error) {
    console.error(error);
  }
};
