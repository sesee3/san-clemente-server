import "dotenv/config";

export default {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiration: 3600, //1h,
  jwtRefreshExpiration: 86400, //1d
};
