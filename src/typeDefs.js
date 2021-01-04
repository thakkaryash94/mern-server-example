const { gql } = require('apollo-server-express')

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

  input PostWhereUniqueInput {
    id: ObjectID
  }

  type Query {
    currentUser: User
    posts(offset: Int, limit: Int): [Post]
    post(where: PostWhereUniqueInput!): Post
  }

  type Mutation {
    createPost(data: PostDataInput!): Post
    updatePost(data: PostDataInput!, where: PostWhereUniqueInput!): Post
    deletePost(where: PostWhereUniqueInput!): Post
    likePost(where: PostWhereUniqueInput!): Post
    signUp(data: AuthInput!): AuthResponse
    signIn(data: AuthInput!): AuthResponse
  }
`

module.exports = typeDefs
