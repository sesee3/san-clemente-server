import jwt from "jsonwebtoken";
import authConfig from "../config/auth.config.js";

export const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) {
    return res.status(403).json({
      message: "Nessun token trovato, richiesta rifiutata",
    });
  }

  try {
    const decoded = jwt.verify(token, authConfig.jwtSecret);
    req.userID = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token non valido o scaduto, richiesta rifiutata",
    });
  }
};
