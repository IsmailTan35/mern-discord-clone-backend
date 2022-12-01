import express from "express";
import bodyParser from "body-parser";
// import cors from "./helperCors"
// import rateLimit from'express-rate-limit'
import cors from "cors";

const App = () => {
  const app = express();

  // app.use(cors)
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cors());
  // app.use(apiRequestLimiter)
  app.get("/", (req: any, res: any) => {
    res.send("sadas");
  });

  app.listen(3000);
  return app;
};

export default App;
