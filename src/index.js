require('dotenv').config()
const express = require('express')
const { ApolloServer } = require('apollo-server-express')
const { MongoClient } = require("mongodb")
const expressJwt = require("express-jwt")
const cors = require('cors')
const typeDefs = require('./typeDefs')
const resolvers = require('./resolvers')

const context = async ({ req }) => {
  const client = new MongoClient(process.env.DB_URL, { useUnifiedTopology: true })
  await client.connect()
  const database = client.db('blogs')
  return {
    req: req,
    mongo: database
  }
}

const server = new ApolloServer({ typeDefs, resolvers, context })

const app = express()
app.use(expressJwt({
  secret: process.env.JWT_SECRET,
  algorithms: ["HS256"],
  credentialsRequired: false,
  getToken: function fromHeaderOrQuerystring(req) {
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
      return req.headers.authorization.split(' ')[1]
    } else if (req.query && req.query.token) {
      return req.query.token
    }
    return null
  }
}))
app.use(cors({ origin: '*' }))
server.applyMiddleware({ app, cors: { origin: '*' } })

app.listen({ port: 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
)
