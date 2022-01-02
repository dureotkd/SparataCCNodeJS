const express = require("express");
const mongoose = require("mongoose");
const Joi = require("joi");
const jwt = require("jsonwebtoken");
const socketIo = require("socket.io");
const { Op } = require("sequelize");

const { User, Goods, Cart } = require("./models");
// const Goods = require("./models/m-goods");
// const Cart = require("./models/m-cart");
const authMiddleware = require("./middlewares/auth-middleware");

const sequelize = require("./models").sequelize;

sequelize.sync({
  force: false,
});

// mongoose.connect(
//   "mongodb+srv://dureotkd:asd123@cluster0.5rubx.mongodb.net/myFirstDatabase?retryWrites=true&w=majority",
//   {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   }
// );

// const db = mongoose.connection;
// db.on("error", console.error.bind(console, "connection error:"));

const app = express();
const Http = require("http");
const http = Http.createServer(app);
const router = express.Router();
const io = socketIo(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use("/api", express.urlencoded({ extended: false }), router);
app.use(express.static("assets"));

http.listen(8080, () => {
  console.log("서버가 요청을 받을 준비가 됐어요");
});

const rooms = {};

const changeRoomViewCount = (roomId) => {
  const roomViewCnt = Object.values(rooms).reduce((value, url) => {
    return {
      ...value,
      [url]: value[url] ? value[url] + 1 : 1,
    };
  }, {});

  // 내가 짠 코드인데 확실히 Reduce 안쓰니까 지저분해 보임
  let viewCnt = {};

  Object.entries(rooms).forEach(([socketIdVal, roomIdVal], key) => {
    if (rooms[socketIdVal] === roomId) {
      if (viewCnt[roomIdVal] === undefined) viewCnt[roomIdVal] = 1;
      else viewCnt[roomIdVal] += 1;
    } else {
      if (viewCnt[roomIdVal] === undefined) viewCnt[roomIdVal] = 1;
      else viewCnt[roomIdVal] += 1;
    }
  });
  // 내가 짠 코드인데 확실히 Reduce 안쓰니까 지저분해 보임

  for (const [socketIdKey, roomIdValue] of Object.entries(rooms)) {
    const count = viewCnt[roomIdValue];

    io.to(roomIdValue).emit("SAME_PAGE_VIEWER_COUNT", count);
  }
};

io.on("connection", (socket) => {
  console.log(`Socket 서버 연결 완`);

  const socketId = socket.id;

  // socket.emit("BUY_GOODS", {
  //   nickname: "서버가 보내준 구매자 닉네임",
  //   goodsId: 10, // 서버가 보내준 상품 데이터 고유 ID
  //   goodsName: "서버가 보내준 구매자가 구매한 상품 이름",
  //   date: "서버가 보내준 구매 일시",
  // });

  socket.on("BUY", ({ nickname, goodsName }) => {
    io.emit("BUY_GOODS", {
      nickname: nickname,
      goodsId: 10,
      goodsName: goodsName,
      date: new Date(),
    });
  });

  socket.on("CHANGED_PAGE", (data) => {
    const roomId = data.substr(-1);

    socket.join(roomId);

    if (rooms[socketId] === undefined) rooms[socketId] = roomId;

    changeRoomViewCount(roomId);

    // 접속된 소켓 방 자료구조 Map 형태
    // const rooms = io.sockets.adapter.rooms;
    // const userCnt = rooms.get(roomId).size;
  });

  socket.on("disconnect", () => {
    delete rooms[socketId];

    console.log("Socket 연결 종료");
  });
});

router.get("/users/me", authMiddleware, async (req, res) => {
  const { user } = res.locals;

  res.status(200).send({ user });
});

router.get("/goods", authMiddleware, async (req, res) => {
  const { category } = req.query;

  let where = [];

  if (category !== undefined) {
    where.push({
      category: category,
    });
  }

  const goods = await Goods.findAll({
    where: where,
    order: [["createdAt", "DESC"]],
    limit: 5,
  });

  res.send({ goods });
});

/**
 * 상품 하나만 가져오기
 */
router.get("/goods/:goodsId", authMiddleware, async (req, res) => {
  const { goodsId } = req.params;

  const goods = await Goods.findByPk(goodsId);

  if (!goods) {
    res.status(404).send({});
  } else {
    res.send({ goods });
  }
});

/**
 * 장바구니 항목 삭제
 */
router.delete("/goods/:goodsId/cart", authMiddleware, async (req, res) => {
  const { userId } = res.locals.user;
  const { goodsId } = req.params;

  const existsCart = await Cart.findOne({
    userId,
    goodsId,
  }).exec();

  if (existsCart) {
    existsCart.delete();
  }

  res.send({});
});

router.get("/goods/carts", authMiddleware, async (req, res) => {
  console.log("??");

  res.send({});
});

/**
 * 장바구니에 상품 담기.
 * 장바구니에 상품이 이미 담겨있으면 갯수만 수정한다.
 */
router.put("/goods/:goodsId/cart", authMiddleware, async (req, res) => {
  const { userId } = res.locals.user;
  const { goodsId } = req.params;
  const { quantity } = req.body;

  const existsCart = await Cart.findOne({
    where: {
      goodsId,
      userId,
    },
  });

  if (existsCart) {
    await Cart.update(
      {
        quantity,
      },
      {
        where: { goodsId, userId },
      }
    );
  } else {
    await Cart.create({ userId, goodsId, quantity });
  }

  // NOTE: 성공했을때 응답 값을 클라이언트가 사용하지 않는다.
  res.send({});
});

router.post("/auth", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ where: { email, password } });

  console.log(user);

  if (!user) {
    res.status(400).send({
      errorMessage: "존재하지 않는 계정입니다",
    });
    return;
  }

  /* 
  HTTP HEADER 값에
  authorization: Bearer JWT 암호화 값이 들어가게됩니다
  */
  const token = jwt.sign({ userId: user.userId }, "jwt-key");

  res.send({ token });
});

router.post("/users", async (req, res) => {
  const { nickname, email, password, confirmPassword } = req.body;

  const table = Joi.object().keys({
    nickname: Joi.string().min(3).max(10).required(),
    email: Joi.string().min(5).max(30).required(),
    password: Joi.string().min(5).max(20).required(),
    confirmPassword: Joi.string().min(5).max(20).required(),
  });

  const { error, value } = table.validate(req.body);

  if (error !== undefined) {
    res.status(400).send({
      errorMessage: error.details[0].message,
    });

    return;
  }

  if (password !== confirmPassword) {
    res.status(400).send({
      errorMessage: "패스워드를 확인란과 동일하게 입력해주세요",
    });
    return;
  }

  const exitUsers = await User.findAll({
    where: {
      [Op.or]: [{ nickname }, { email }],
    },
  });

  if (exitUsers.length) {
    res.status(400).send({
      errorMessage: "이미 가입된 계정이 존재합니다",
    });

    return;
  }

  await User.create({ email, nickname, password });

  res.status(201).send({});
});
