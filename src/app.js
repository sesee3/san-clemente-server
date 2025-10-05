import express from "express";
import helmet from "helmet";
import cors from "cors";
import authRoutes from "../src/routes/authRoutes.js";
import datas from "../src/routes/dataRouter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { verifyToken } from "./middleware/auth.js";
import { reset, clearUsers, clearEvents } from "./config/init.database.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" ? "" : "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());
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

app.use("/v1/auth", authRoutes);
app.use("/v1/data", datas);

app.post("/v1/database/reset", verifyToken, async (req, res, next) => {
  try {
    await reset();
    res.status(200).json({ ok: true, action: "reset" });
  } catch (err) {
    next(err);
  }
});
app.post("/v1/database/clear_users", verifyToken, async (req, res, next) => {
  try {
    await clearUsers();
    res.status(200).json({ ok: true, action: "clear_users" });
  } catch (err) {
    next(err);
  }
});
app.post("/v1/database/clear_events", verifyToken, async (req, res, next) => {
  try {
    await clearEvents();
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
  });
});

export default app;
