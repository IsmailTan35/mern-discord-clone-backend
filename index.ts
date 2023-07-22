import dotenv from "dotenv";
import express from "./backend/app_server/helper/helperExpress";
import {
  httpServer,
  webSocket,
} from "./backend/app_server/helper/helperProtocol";
import controllerApi from "./backend/app_server/controller/apicontroller";
import controlleWebsocket from "./backend/app_server/controller/socketcontroller";
import mongoDb from "./backend/app_server/models/mongoDb";

const env = dotenv.config();
const app = express();

const port = process.env.PORT || 10000;
const db = mongoDb();
const server = httpServer(app, port);
const socket = webSocket(server);
// app.io=socket

controllerApi(app);
controlleWebsocket(socket, "con");

// import express from "express";
// import bodyParser from "body-parser";
// // import cors from "./helperCors"
// // import rateLimit from'express-rate-limit'
// import cors from "cors";

// const app = express();

// // app.use(cors)
// // app.use(bodyParser.json());
// // app.use(bodyParser.urlencoded({ extended: true }));
// // app.use(express.json());
// // app.use(cors());
// // app.use(apiRequestLimiter)
// app.get("/", (req: any, res: any) => {
//   res.send("sadas");
// });

// app.listen(3000);
