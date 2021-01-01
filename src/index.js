require('dotenv').config()
const express = require('express')
const { ApolloServer, gql, UserInputError } = require('apollo-server-express')
const { DateTimeResolver, ObjectIDResolver } = require("graphql-scalars")
const { MongoClient, ObjectID } = require("mongodb")
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const saltRounds = 10

const context = async ({ req }) => {
  const client = new MongoClient(process.env.DB_URL, { useUnifiedTopology: true })
  await client.connect()
  const database = client.db('demo_news')
  return {
    req: req,
    mongo: database
  }
}

function getUser(req) {
  const decoded = jwt.verify(req.headers['authorization'], process.env.JWT_SECRET)
  return decoded
}

// Construct a schema, using GraphQL schema language
const typeDefs = gql`

  scalar DateTime
  scalar ObjectID

  type Post {
    id: ObjectID
    title: String
    content: String
    author: User
    likes: Int
    createdAt: DateTime
    updatedAt: DateTime
    success: Boolean
    message: String
  }

  type User {
    id: ObjectID
    userName: String
  }

  type AuthResponse {
    token: String
    success: Boolean!
    message: String
  }

  input AuthInput {
    userName: String!
    password: String!
  }

  input PostDataInput {
    title: String
    content: String
  }

  input PostWhereInput {
    skip: Int
    take: Int
  }

  input PostWhereUniqueInput {
    id: ObjectID
  }

  type Query {
    currentUser: User
    posts(where: PostWhereInput): [Post]
    post(where: PostWhereUniqueInput!): Post
  }

  type Mutation {
    createPost(data: PostDataInput!): Post
    updatePost(data: PostDataInput!, where: PostWhereUniqueInput!): Post
    deletePost(where: PostWhereUniqueInput!): Post
    likePost(where: PostWhereUniqueInput!): Post
    signUp(data: AuthInput!): AuthResponse
    logIn(data: AuthInput!): AuthResponse
  }
`

// Provide resolver functions for your schema fields
const resolvers = {
  ObjectID: ObjectIDResolver,
  DateTime: DateTimeResolver,
  Query: {
    currentUser: async (_parent, args, context, _info) => {
      try {
        const userObj = getUser(context.req)
        if (userObj.userId) {
          const userCollection = context.mongo.collection('users')
          const user = await userCollection.findOne({ _id: ObjectID(userObj.userId) }, { projection: { _id: 1, userName: 1 } })
          if (user === null) {
            throw new UserInputError('Invalid user id!')
          } else {
            return {
              id: user._id,
              userName: user.userName
            }
          }
        } else {
          throw new UserInputError('Invalid user id!')
        }
      } catch (error) {
        throw new Error('Invalid auth token!')
      }
    },
    posts: async (_parent, args, context, _info) => {
      const postCollection = context.mongo.collection('posts')
      let skip = 0
      let limit = 10

      if (args.where) {
        if (args.where.skip) {
          skip = args.where.skip
        }
        if (args.where.take) {
          limit = args.where.take
        }
      }
      const posts = await postCollection.find({}, {
        skip: skip,
        limit: limit,
      }).toArray()
      return posts.map(post => ({ ...post, id: post._id }))
    },
    post: async (_parent, args, context, _info) => {
      const postCollection = context.mongo.collection('posts')
      const post = await postCollection.findOne({ _id: ObjectID(args.where.id) })
      if (post === null) {
        throw new UserInputError('Invalid post id!')
      } else {
        return {
          ...post,
          id: post._id
        }
      }
    },
  },
  Mutation: {
    createPost: async (_parent, args, context, _info) => {
      try {
        const userObj = getUser(context.req)
        if (userObj.userId) {
          const postCollection = context.mongo.collection('posts')
          const newPost = await postCollection.insertOne({
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
            author: ObjectID(userObj.userId),
            likes: 0
          })
          if (newPost.insertedCount === 1) {
            const post = await postCollection.findOne({ _id: newPost.insertedId })
            return {
              ...post,
              id: post._id,
              success: true,
              message: 'Post created successfully!'
            }
          } else {
            return {
              success: false,
              message: 'Post not found!'
            }
          }
        } else {
          return {
            success: false,
            message: 'User not found!'
          }
        }
      } catch (error) {
        return {
          success: false,
          message: 'Something went wrong!'
        }
      }
    },
    deletePost: async (_parent, args, context, _info) => {
      try {
        const userObj = getUser(context.req)
        if (userObj.userId) {
          const postCollection = context.mongo.collection('posts')
          const deletePostResponse = await postCollection.deleteOne({ _id: ObjectID(args.where.id) })
          if (deletePostResponse.deletedCount === 1) {
            return {
              success: true,
              message: 'Post delete successfully!'
            }
          } else {
            return {
              success: false,
              message: 'Post does not exist!'
            }
          }
        } else {
          return {
            success: false,
            message: 'User not found!'
          }
        }
      } catch (error) {
        if (error.message.indexOf('jwt') >= 0) {
          return {
            success: false,
            message: 'Invalid Auth token!'
          }
        } else {
          return {
            success: false,
            message: 'Something went wrong!'
          }
        }
      }
    },
    likePost: async (_parent, args, context, _info) => {
      try {
        const userObj = getUser(context.req)
        if (userObj.userId) {
          const postCollection = context.mongo.collection('posts')
          const updatePost = await postCollection.findOneAndUpdate({ _id: ObjectID(args.where.id) }, { $inc: { likes: 1 } })
          if (updatePost.value) {
            return {
              ...updatePost.value,
              id: updatePost.value._id,
              success: true,
              message: 'Post liked successfully!'
            }
          } else {
            return {
              success: false,
              message: 'Post does not exist!'
            }
          }
        }
      } catch (error) {
        return {
          success: false,
          message: 'Something went wrong!'
        }
      }
    },
    signUp: async (_parent, args, context, _info) => {
      const userCollection = context.mongo.collection('users')
      const user = await userCollection.findOne({ userName: args.data.userName })
      if (user === null) {
        const hash = await bcrypt.hash(args.data.password, saltRounds)

        const newUser = await userCollection.insertOne({ userName: args.data.userName, password: hash })
        if (newUser.insertedCount === 1) {
          return {
            token: jwt.sign({ userId: newUser.insertedId }, process.env.JWT_SECRET),
            success: true
          }
        } else {
          return {
            success: false,
            message: 'Something went wrong!'
          }
        }
      } else {
        return {
          success: false,
          message: 'Username already exists!'
        }
      }
    },
    logIn: async (_parent, args, context, _info) => {
      const userCollection = context.mongo.collection('users')
      const user = await userCollection.findOne({ userName: args.data.userName }, { projection: { _id: 1, password: 1 } })
      const result = await bcrypt.compare(args.data.password, user.password)
      if (result) {
        return {
          token: jwt.sign({ userId: user._id }, process.env.JWT_SECRET),
          success: true
        }
      } else {
        return {
          success: false,
          message: 'Invalid username or password!'
        }
      }
    },
  }
}

const server = new ApolloServer({ typeDefs, resolvers, context })

const app = express()
server.applyMiddleware({ app })

app.listen({ port: 4000 }, () =>
  console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`)
)
