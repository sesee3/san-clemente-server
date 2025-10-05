import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/model.user.js";
import authConfig from "../config/auth.config.js";

export const signup = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const alreadyExists = await User.findByName(username);
    if (alreadyExists) {
      return res.status(400).json({
        message: "Nome utente non disponibile",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create(username, hashedPassword);

    const token = jwt.sign(
      { id: user.id, username: user.username },
      authConfig.jwtSecret,
      { expiresIn: authConfig.jwtExpiration },
    );

    res.status(201).json({
      humanMessage: "Utente registrato correttamente",
      state: "signed_up",
      user: {
        id: user.id,
        username: user.username,
      },
      accessToken: token,
    });
  } catch (error) {
    next(error);
  }
};

export const signin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Inserisci email e password correttamente",
      });
    }

    const user = await User.findByName(username);

    if (!user) {
      return res.status(404).json({
        message: "Utente non trovato",
      });
    }

    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      return res.status(401).json({
        message: "Password non corretta",
      });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      authConfig.jwtSecret,
      { expiresIn: authConfig.jwtExpiration },
    );

    res.status(200).json({
      humanMessage: "Login effettuato con successo",
      state: "signed_in",
      user: {
        id: user.id,
        username: user.username,
      },
      accessToken: token,
    });
  } catch (error) {
    next(error);
  }
};
