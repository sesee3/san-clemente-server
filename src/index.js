import express from "express";
import helmet from "helmet";
import cors from "cors";
import authRoutes from "../src/routes/authRoutes.js";
import datas from "../src/routes/dataRouter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { verifyToken } from "./middleware/auth.js";

import { listFiles } from "./config/gdrive.config.js";

const app = express();

app.use(helmet());
app.use(cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

//For middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

//Health API
app.get("/v1/health", (req, res) => {
  res.json({
    ok: true,
  });
});

app.get("/v1/availability", (req, res) => {
  res.json({
    response: "sucess",
  });
});

app.get("/", (req, res) => {
  res.status(200).json({
    route: "Ok",
  });
});

app.get("/gdrive/test", (req, res) => {
  try {
    const test = listFiles();
    res.status(200).json(test);
  } catch (error) {
    res.status(500).json({
      error: error,
    });
  }
});

app.use("/v1/auth", authRoutes);
app.use("/v1/data", datas);

app.post("/v1/database/reset", verifyToken, async (req, res, next) => {
  try {
    // await reset();
    res.status(200).json({ ok: true, action: "reset" });
  } catch (err) {
    next(err);
  }
});
app.post("/v1/database/clear_users", verifyToken, async (req, res, next) => {
  try {
    // await clearUsers();
    res.status(200).json({ ok: true, action: "clear_users" });
  } catch (err) {
    next(err);
  }
});
app.post("/v1/database/clear_events", verifyToken, async (req, res, next) => {
  try {
    // await clearEvents();
    res.status(200).json({ ok: true, action: "clear_events" });
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

//For 404 errors
app.use((req, res) => {
  res.status(404).json({
    message: "Invalid route",
    route: req.originalUrl,
  });
});

export default app;
