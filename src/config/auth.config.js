import "dotenv/config";

export default {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiration: 2592000, //30d,
  jwtRefreshExpiration: 31536000, //1y
};
