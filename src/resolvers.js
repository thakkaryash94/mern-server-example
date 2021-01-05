const { UserInputError } = require('apollo-server-express')
const { DateTimeResolver, ObjectIDResolver } = require("graphql-scalars")
const { ObjectID } = require("mongodb")
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const saltRounds = 10

module.exports = {

  // resolve scalar types
  ObjectID: ObjectIDResolver,
  DateTime: DateTimeResolver,

  // Resolve author field from Post type
  Post: {
    author: async (post, args, { mongo }) => {
      const userCollection = mongo.collection('users')
      const user = await userCollection.findOne({ _id: ObjectID(post.author) }, { projection: { _id: 1, userName: 1 } })
      return {
        id: user._id,
        userName: user.userName
      }
    }
  },
  Query: {
    currentUser: async (_parent, args, { mongo, req: { user } }, _info) => {
      try {
        if (user === undefined) {
          throw new UserInputError('Invalid user id!')
        }
        const userCollection = mongo.collection('users')
        const currentUser = await userCollection.findOne({ _id: ObjectID(user.id) }, { projection: { _id: 1, userName: 1 } })
        if (currentUser === null) {
          throw new UserInputError('Invalid user id!')
        } else {
          return {
            id: currentUser._id,
            userName: currentUser.userName
          }
        }
      } catch (error) {
        return error
      }
    },
    posts: async (_parent, args, context, _info) => {
      const postCollection = context.mongo.collection('posts')
      let offset = 0
      let limit = 10

      if (args.offset) {
        offset = args.offset
      }
      if (args.limit) {
        limit = args.limit
      }
      const posts = await postCollection.find({}, {
        skip: offset,
        limit: limit,
      }).sort({ createdAt: -1 }).toArray()
      return posts.map(post => ({ ...post, id: post._id }))
    },
    post: async (_parent, args, { mongo }, _info) => {
      const postCollection = mongo.collection('posts')
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
    createPost: async (_parent, args, { mongo, req: { user } }, _info) => {
      try {
        if (user === undefined) {
          return {
            success: false,
            message: 'User not found!'
          }
        }
        const postCollection = mongo.collection('posts')
        const newPost = await postCollection.insertOne({
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: ObjectID(user.id),
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

      } catch (error) {
        return {
          success: false,
          message: 'Something went wrong!'
        }
      }
    },
    deletePost: async (_parent, args, { mongo, req: { user } }, _info) => {
      try {
        if (user === undefined) {
          return {
            success: false,
            message: 'User not found!'
          }
        }
        const postCollection = mongo.collection('posts')
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
    updatePost: async (_parent, args, { mongo, req: { user } }, _info) => {
      try {
        if (user === undefined) {
          return {
            success: false,
            message: 'User not found!'
          }
        }
        const postCollection = mongo.collection('posts')
        const updatePost = await postCollection.findOneAndUpdate(
          { _id: ObjectID(args.where.id) },
          { $set: args.data },
          { returnOriginal: false })
        if (updatePost.value) {
          return {
            ...updatePost.value,
            id: updatePost.value._id,
            success: true,
            message: 'Post updated successfully!'
          }
        } else {
          return {
            success: false,
            message: 'Post does not exist!'
          }
        }
      } catch (error) {
        return {
          success: false,
          message: 'Something went wrong!'
        }
      }
    },
    likePost: async (_parent, args, { mongo, req: { user } }, _info) => {
      try {
        const postCollection = mongo.collection('posts')
        const updatePost = await postCollection.findOneAndUpdate(
          { _id: ObjectID(args.where.id) },
          { $inc: { likes: 1 } },
          { returnOriginal: false })
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
      } catch (error) {
        return {
          success: false,
          message: 'Something went wrong!'
        }
      }
    },
    signUp: async (_parent, args, { mongo }, _info) => {
      const userCollection = mongo.collection('users')
      const user = await userCollection.findOne({ userName: args.data.userName })
      if (user === null) {
        const hash = await bcrypt.hash(args.data.password, saltRounds)

        const newUser = await userCollection.insertOne({ userName: args.data.userName, password: hash })
        if (newUser.insertedCount === 1) {
          return {
            token: jwt.sign({ id: newUser.insertedId }, process.env.JWT_SECRET),
            success: true,
            message: "User created successfully!"
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
    signIn: async (_parent, args, { mongo }, _info) => {
      const userCollection = mongo.collection('users')
      const user = await userCollection.findOne({ userName: args.data.userName }, { projection: { _id: 1, password: 1 } })
      const result = await bcrypt.compare(args.data.password, user.password)
      if (result) {
        return {
          token: jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            algorithm: "HS256",
            expiresIn: '1d'
          }),
          success: true,
          message: 'User signed in successfully!'
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
