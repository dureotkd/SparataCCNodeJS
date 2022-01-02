const jwt = require("jsonwebtoken");
const { User } = require("../models");
module.exports = (req, res, next) => {
  const { authorization } = req.headers;

  console.log(authorization);

  const [tokenType, tokenValue] = authorization.split(" ");

  if (tokenType !== "Bearer") {
    res.status(401).send({
      errorMessage: "로그인 후 사용하세요",
    });
  }

  try {
    const { userId } = jwt.verify(tokenValue, "jwt-key");

    const user = User.findByPk(userId).then((user) => {
      // console.log(user);
      res.locals.user = user;
      next();
    });
  } catch (e) {
    res.status(401).send({
      errorMessage: "로그인 후 사용하세요",
    });
  }
};
