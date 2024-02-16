const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const dbpath = path.join(__dirname, 'twitterClone.db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: '${e.message}'`)
    process.exit(1)
  }
}

initializeDbAndServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
    return
  }
  const hashedpassword = await bcrypt.hash(password, 10)
  const query1 = `
    select *
    from user
    where username ='${username}'`

  const result1 = await db.get(query1)
  if (result1 !== undefined) {
    response.status(400)
    response.send('User already exists')
    return
  } else {
    const query2 = `
        insert into 
        user (username, password, name, gender)
        values ('${username}', '${hashedpassword}', '${name}', '${gender}')`

    await db.run(query2)
    response.status(200)
    response.send('User created successfully')
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const query1 = `
    select *
    from user
    where username ='${username}'`
  const result1 = await db.get(query1)
  if (result1 === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const checkpassword = await bcrypt.compare(password, result1.password)
    if (checkpassword === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authheader = request.headers['authorization']
  if (authheader !== undefined) {
    jwtToken = authheader.split(' ')[1]
  }
  if (authheader === undefined) {
    console.log('give a token')
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_KEY', async (error, payload) => {
      if (error) {
        console.log('error in token')
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const query1 = `select 
   user_id from user where username ='${username}'`
  const result1 = await db.get(query1)

  const query3 = `
   select tweet.tweet, tweet.date_time as dateTime, user.username
   from
    tweet  inner join follower
   on tweet.user_id=follower.following_user_id
   inner join user on follower.following_user_id=user.user_id
   where follower.follower_user_id=${result1.user_id}
   order by tweet.date_time desc
   limit 4 `
  const result3 = await db.all(query3)
  const convertobj = each => {
    return {
      username: each.username,
      tweet: each.tweet,
      dateTime: each.dateTime,
    }
  }
  console.log(result3.map(each => convertobj(each)))
  response.send(result3.map(each => convertobj(each)))
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const query1 = `select 
   user_id from user where username ='${username}'`
  const result1 = await db.get(query1)
  const query2 = `
  select 
  username as name from user inner join follower on
  user.user_id=follower.following_user_id
  where follower.follower_user_id = ${result1.user_id}`
  const result3 = await db.all(query2)

  const convertobj = each => {
    return {
      name: each.name,
    }
  }
  console.log(result3.map(each => convertobj(each)))
  response.send(result3.map(each => convertobj(each)))
})

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const query1 = `select 
   user_id from user where username ='${username}'`
  const result1 = await db.get(query1)
  const query2 = `
  select 
  username as name from user inner join follower on
  user.user_id=follower.follower_user_id
  where follower.following_user_id = ${result1.user_id}`
  const result3 = await db.all(query2)
  const convertobj = each => {
    return {
      name: each.name,
    }
  }
  console.log(result3.map(each => convertobj(each)))
  response.send(result3.map(each => convertobj(each)))
})

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const query1 = `
  select user_id from user
  where username='${username}'`

  const result1 = await db.get(query1)
  console.log(result1.user_id)
  const query2 = `
  select tweet.tweet_id, follower.following_user_id, follower.follower_user_id from tweet
  inner join follower on follower.follower_user_id = tweet.user_id
  where follower.following_user_id = ${result1.user_id}`

  const result2 = await db.all(query2)
  console.log(result2)
  const tweetids = result2.map(each => each.tweet_id)
  console.log(tweetids)
  if (tweetids.includes(parseInt(tweetId))) {
    const query3 = `
    select tweet.tweet,
    count(DISTINCT like.like_id) as likes,
    count(DISTINCT reply.reply_id) as replies,
    tweet.date_time as dateTime
    from tweet left join like on
    tweet.tweet_id = like.tweet_id
    left join reply 
    on  reply.tweet_id=tweet.tweet_id 
    where tweet.tweet_id = ${tweetId}
    group by tweet.tweet_Id`

    const result3 = await db.get(query3)

    response.send({
      tweet: result3.tweet,
      likes: result3.likes,
      replies: result3.replies,
      dateTime: result3.dateTime,
    })
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const query1 = `
  select user_id from user
  where username='${username}'`

    const result1 = await db.get(query1)

    const query2 = `
  select tweet.tweet_id from tweet
  inner join follower on follower.follower_user_id = tweet.user_id
  where follower.following_user_id = ${result1.user_id}`

    const result2 = await db.all(query2)
    console.log(result2)
    const tweetids = result2.map(each => each.tweet_id)
    console.log(tweetids)
    if (tweetids.includes(parseInt(tweetId))) {
      const query3 = `
    select user.username
    from user inner join like on like.user_id=user.user_id
    where like.tweet_id = ${tweetId}
    `

      const result3 = await db.all(query3)
      let usernames = result3.map(each => each.username)
      response.send({likes: usernames})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const query1 = `
  select user_id from user
  where username='${username}'`

    const result1 = await db.get(query1)

    const query2 = `
  select tweet.tweet, tweet.tweet_id from tweet
  inner join follower on follower.following_user_id = tweet.user_id
  where follower.follower_user_id = ${result1.user_id}`

    const result2 = await db.all(query2)
    console.log(result2)
    const tweets = result2.find(each => each.tweet_id === parseInt(tweetId))
    console.log(tweets)
    if (tweets) {
      const query3 = `
    select user.username as name, reply.reply
    from user inner join reply on reply.user_id=user.user_id
    where reply.tweet_id = ${tweetId}
    `

      const result3 = await db.all(query3)
      let values = result3.map(each => ({
        name: each.name,
        reply: each.reply,
      }))
      response.send({
        tweet: tweets.tweet,
        replies: values,
      })
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const query1 = `
  select user_id from user
  where username='${username}'`
  const result1 = await db.get(query1)
  const query2 = `
  select tweet.tweet, 
  count(DISTINCT like.like_id) as likes,
  count(DISTINCT reply.reply_id) as replies,
  tweet.date_time as dateTime from
  tweet left join like on tweet.tweet_id=like.tweet_id
  left join reply on  tweet.tweet_id=reply.tweet_id
  where tweet.user_id=${result1.user_id}
  group by tweet.tweet_id`
  const result2 = await db.all(query2)
  response.send(result2)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweet} = request.body
  const query1 = `
  select user_id from user
  where username='${username}'`
  const result1 = await db.get(query1)

  const query2 = `
  insert into tweet (tweet, user_id)
  values ('${tweet}' , ${result1.user_id}) 
  `

  await db.run(query2)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const query1 = `
  select user_id from user
  where username='${username}'`
    const result1 = await db.get(query1)
    const query2 = `
  select tweet.tweet_id from tweet
  inner join user  on user.user_id = tweet.user_id
  where user.user_id = ${result1.user_id}`

    const result2 = await db.all(query2)
    console.log(result2)
    const tweetids = result2.map(each => each.tweet_id)
    if (tweetids.includes(parseInt(tweetId))) {
      const query3 = `
    delete from tweet
    where tweet_id=${tweetId}`
      await db.run(query3)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)
module.exports = app
