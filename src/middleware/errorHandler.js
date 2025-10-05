export const errorHandler = (err, req, res, next) => {
  console.error("Errore", err.stack);

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
    });
  }

  res.status(500).json({
    status: "error",
    message:
      process.env.NODE_ENV === "production"
        ? "Errore interno al server"
        : err.message,
  });
};
