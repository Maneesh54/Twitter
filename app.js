const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "./twitterClone.db");

const app = express();
app.use(express.json());
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running");
    });
  } catch (e) {
    console.log(`Error : ${e.message}`);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_STRING", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const { username } = payload;
        request.username = username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const findUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const user = await db.get(findUserQuery);
  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const postUserQuery = `
          INSERT INTO
          user (name,username,password,gender)
          VALUES
          (
              '${name}',
              '${username}',
              '${hashedPassword}',
              '${gender}'
          );`;
      await db.run(postUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const findUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const user = await db.get(findUserQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordsMatched = await bcrypt.compare(password, user.password);
    if (isPasswordsMatched === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_STRING");
      response.send({ jwtToken });
    }
  }
});

app.get("/user/following/",authenticateToken , async (request, response) => {
  const { username } = request;
  const getPeopleFollowedByUserQuery = `
    SELECT 
    u2.name
    FROM
    user as u1 join follower on u1.user_id=follower.follower_user_id
    join user as u2 on u2.user_id=follower.following_user_id
    where u1.username='${username}';
    `;
  const peopleFollowed = await db.all(getPeopleFollowedByUserQuery);
  response.send(peopleFollowed);
});

app.get("/user/followers", authenticateToken , async (request, response) => {
  const { username } = request;
  const getFollowersQuery = `
    SELECT 
    u1.name
    FROM
    user as u1 join follower on u1.user_id=follower.follower_user_id
    join user as u2 on u2.user_id=follower.following_user_id
    where u2.username='${username}'
    `;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

app.get("/user/tweets/",authenticateToken, async (request, response) => {
  const { username } = request;
  const getTweetsQuery = `
    select
    tweet.tweet,
    count(like.like_id) as likes,
    count(reply.reply_id) as replies,
    tweet.date_time as dateTime
    from
    user join tweet on user.user_id=tweet.user_id
    left join reply on reply.tweet_id=tweet.tweet_id
    left join like on like.tweet_id=tweet.tweet_id
    where user.username='${username}'
    group by tweet.tweet_id
    `;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

app.post("/user/tweets/",authenticateToken , async (request, response) => {
  const { username } = request;
  const getUserId = `
    select user_id as userId from user where username='${username}';
    `;
  const { userId } = await db.get(getUserId);
  const { tweet } = request.body;
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  const postTweetQuery = `
      INSERT INTO
      tweet (tweet,user_id,date_time)
      VALUES
      (
          '${tweet}',
          ${userId},
          '${year}-${month}-${day} ${hour}:${minute}:${second}'
      )`;
  const result = await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getTweetsOfUser = `
    select 
    tweet.tweet_id 
    from user natural join tweet 
    where user.username='${username}';
    `;
    const tweetsOfUser = await db.all(getTweetsOfUser);
    const isTrue = tweetsOfUser.some(
      (tweet) => tweet.tweet_id === parseInt(tweetId)
    );
    if (isTrue === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        delete from tweet
        where tweet_id=${tweetId};
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
