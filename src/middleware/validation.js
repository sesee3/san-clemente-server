export const validateSignup = (req, res, next) => {
  const { username, password } = req.body;

  if (!username || username.lenght < 3) {
    return res.status(400).json({
      message: "L'username deve avere almeno 3 caratteri",
    });
  }

  if (!password || password.lenght < 6) {
    return res.status(400).json({
      message: "La password deve avere almeno 6 caratteri",
    });
  }

  next();
};
