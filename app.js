const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())
dbPath = path.join(__dirname, 'twitterClone.db')
let db = null
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log(`Server Running at http://localhost:3000/`)
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()
/*****************************API 1************************* */
//Resigter new user
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const userCheckQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(userCheckQuery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      //Scenario 2
      response.status(400)
      response.send('Password is too short')
    } else {
      //Scenario 3
      const hashPassword = await bcrypt.hash(password, 10)
      const registerUserQuery = `
            INSERT INTO 
                user(username, password, name, gender)
            VALUES
                ('${username}', '${hashPassword}', '${name}', '${gender}');`
      await db.run(registerUserQuery)
      response.send('User created successfully')
    }
  } else {
    //Scenario 1
    response.status(400)
    response.send('User already exists')
  }
})
/*****************************API 2************************* */
//Login new users
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const payLoad = {username}
  const jwtToken = jwt.sign(payLoad, 'MY_SECRET_KEY')
  const userCheckQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(userCheckQuery)
  if (dbUser === undefined) {
    //Scenario 1
    response.status(400)
    response.send('Invalid user')
  } else {
    //Scenario 3
    const isPasswordMatches = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatches) {
      response.send({jwtToken})
    } else {
      //Scenario 2
      response.status(400)
      response.send('Invalid password')
    }
  }
})
//Authentication with JWT Token
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    //Scenario 1
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_KEY', async (error, payLoad) => {
      if (error) {
        //Scenario 1
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        //Scenario 2
        request.headers.username = payLoad.username
        next()
      }
    })
  }
}
const isUserFollowing = async (request, response, next) => {
  const {tweetId} = request.params
  const {username} = request.headers
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserQuery)
  const userId = dbUser['user_id']
  const followingQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId}`
  const userFollowingData = await db.all(followingQuery)
  // console.log(userFollowingData);
  const tweetUserIdQuery = `
    SELECT * FROM tweet WHERE tweet_id = ${tweetId}`
  const tweetData = await db.get(tweetUserIdQuery)
  const tweetUserID = tweetData['user_id']
  let isTweetUSerIDInFollowingIds = false
  userFollowingData.forEach(each => {
    if (each['following_user_id'] === tweetUserID) {
      isTweetUSerIDInFollowingIds = true
    }
  })
  if (isTweetUSerIDInFollowingIds) {
    next()
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
}
/*****************************API 3************************* */
//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request.headers
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserQuery)
  const userId = dbUser['user_id']
  const query = `
    SELECT username, tweet, date_time As dateTime
    FROM follower INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    NATURAL JOIN user
    WHERE follower.follower_user_id = ${userId}
    ORDER BY dateTime DESC
    LIMIT 4`
  const data = await db.all(query)
  response.send(data)
})
/*****************************API 4************************* */
//Returns the list of all names of people whom the user follows
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request.headers
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserQuery)
  const userId = dbUser['user_id']
  const query = `
    SELECT name 
    FROM follower INNER JOIN user
    ON follower.following_user_id = user.user_id
    WHERE follower_user_id = ${userId};`
  const data = await db.all(query)
  response.send(data)
})
/*****************************API 5**************************/
//API 5
//Returns the list of all names of people who follows the user
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request.headers
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserQuery)
  const userId = dbUser['user_id']
  const query = `
    SELECT name
    FROM follower INNER JOIN user
    ON follower.follower_user_id = user.user_id
    WHERE following_user_id = ${userId};`
  const data = await db.all(query)
  response.send(data)
})
/*****************************API 6**************************/
app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId} = request.params
    const query = `
    SELECT tweet, COUNT() AS replies, date_time AS dateTime 
    FROM tweet INNER JOIN reply
    ON tweet.tweet_id = reply.tweet_id   
    WHERE tweet.tweet_id = ${tweetId};`
    const data = await db.get(query)
    const likesQuery = `
    SELECT COUNT() AS likes
    FROM like WHERE tweet_id  = ${tweetId};`
    const {likes} = await db.get(likesQuery)
    data.likes = likes
    response.send(data)
  },
)
/*****************************API 7**************************/
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId} = request.params
    const query = `
        SELECT username
        FROM like NATURAL JOIN user
        WHERE tweet_id = ${tweetId};`
    const data = await db.all(query)
    const usernamesArray = data.map(each => each.username)
    response.send({likes: usernamesArray})
  },
)
/*****************************API 8**************************/
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const {tweetId} = request.params
    const query = `
        SELECT name, reply
        FROM reply NATURAL JOIN user
        WHERE tweet_id = ${tweetId};`
    const data = await db.all(query)
    // const namesArray = data.map((each) => each.name);
    response.send({replies: data})
  },
)
/*****************************API 9**************************/
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request.headers
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserQuery)
  const userId = dbUser['user_id']
  const query = `
    SELECT tweet, COUNT() AS likes, date_time As dateTime
    FROM tweet INNER JOIN like
    ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;`
  let likesData = await db.all(query)
  const repliesQuery = `
    SELECT tweet, COUNT() AS replies
    FROM tweet INNER JOIN reply
    ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;`
  const repliesData = await db.all(repliesQuery)
  likesData.forEach(each => {
    for (let data of repliesData) {
      if (each.tweet === data.tweet) {
        each.replies = data.replies
        break
      }
    }
  })
  response.send(likesData)
})
/*****************************API 10**************************/
//Create a tweet in the tweet table
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request.headers
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserQuery)
  const userId = dbUser['user_id']
  const query = `
    INSERT INTO 
        tweet(tweet, user_id)
    VALUES ('${tweet}', ${userId});`
  await db.run(query)
  response.send('Created a Tweet')
})
/*****************************API 11**************************/
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request.headers
    const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
    const dbUser = await db.get(getUserQuery)
    const userId = dbUser['user_id']
    const userTweetsQuery = `
    SELECT tweet_id, user_id 
    FROM tweet
    WHERE user_id = ${userId};`
    const userTweetsData = await db.all(userTweetsQuery)
    let isTweetUsers = false
    userTweetsData.forEach(each => {
      if (each['tweet_id'] == tweetId) {
        isTweetUsers = true
      }
    })
    if (isTweetUsers) {
      const query = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};`
      await db.run(query)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)
module.exports = app

// const express = require('express')

// const {open} = require('sqlite')

// const sqlite3 = require('sqlite3')

// const path = require('path')

// const bcrypt = require('bcrypt')

// const jwt = require('jsonwebtoken')

// const app = express()

// app.use(express.json())

// const dbPath = path.join(__dirname, 'twitterClone.db')

// const initializeDBAndServer = async () => {
//   try {
//     db = await open({filename: dbPath, driver: sqlite3.Database})

//     app.listen(3000, () => {
//       console.log('Ther server is started at http://localhost:3000/')
//     })
//   } catch (e) {
//     console.log(`Error : ${e.message}`)

//     process.exit(1)
//   }
// }

// initializeDBAndServer()

// const authenticateToken = (request, response, next) => {
//   let jwtToken

//   const authHeader = request.headers['authorization']

//   if (authHeader) {
//     jwtToken = authHeader.split(' ')[1]

//     jwt.verify(jwtToken, 'MY_SECRET_KEY', async (error, payload) => {
//       if (error) {
//         // response.status(400)

//         response.send('Invalid JWT Token')
//       } else {
//         request.username = payload.username
//         next()
//       }
//     })
//   } else {
//     //response.status(400)

//     response.send('Invalid JWT Token')
//   }
// }

// // API 1

// app.post('/register/', async (request, response) => {
//   const {username, password, name, gender} = request.body

//   const userDetailsQuery = `

//     SELECT

//     * FROM

//     user

//     WHERE

//     username = '${username}';`

//   const userDetails = await db.get(userDetailsQuery)

//   if (userDetails === undefined) {
//     // console.log('if block')

//     if (password.length < 6) {
//       // response.status(400)

//       response.send('Password is too short')
//     }

//     const hashedPassword = bcrypt.hash(password, 10)

//     const addUserQuery = `

//     INSERT INTO user

//     (name, username, password, gender)

//      values(

//       '${name}',

//       '${username}',

//       '${hashedPassword}',

//       '${gender}');

//     `

//     await db.run(addUserQuery)

//     response.status(200)

//     response.send('User created successfully')
//   } else {
//     response.status = 400

//     response.send('User already exists')
//   }
// })

// // API 2

// app.post('/login', async (request, response) => {
//   const {username, password} = request.body
//   console.log(request.body)

//   const existUserQuery = `select * from user where username = '${username}';`

//   const existingUser = await db.get(existUserQuery)

//   if (existingUser) {
//     console.log(existingUser)

//     const passwordMatch = await bcrypt.compare(password, existingUser.password)

//     if (passwordMatch) {
//       console.log('Login successfull')

//       const payload = {username: username, userId: existingUser.user_id}

//       const jwtToken = jwt.sign(payload, 'MY_SECRET_KEY')

//       response.send({jwtToken: jwtToken})
//     } else {
//       response.status(400).send('Invalid password')
//     }
//   } else {
//     response.status = 400

//     response.send('Invalid user')
//   }
// })

// //API 7
// app.get(
//   '/tweets/:tweetId/likes/',
//   authenticateToken,

//   async (request, response) => {
//     const {tweetId} = request.params
//     const query = `
//       select username
//       from
//       user
//       where user_id in
//     (select user_id from like where tweet_id = ${tweetId});   `
//     const data = await db.all(query)
//     response.send(data)
//     console.log('api7')
//   },
// )
