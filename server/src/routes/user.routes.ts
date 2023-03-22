import express from "express"
import jwtDecode from "jwt-decode"
import { ObjectId } from "mongodb"
import client from "../client"
import cryptr from "../cryptyr"
import idTokenToMongoID from "../functions/idTokenToMongoID"
import verifyAccessToken from "../functions/verifyAccessToken"
import extractIDToken from "../hooks/extractIDToken"
import subToObjectId from "../hooks/subToObjectId"
import requireAuth from "../middleware/requireAuth"
import iUserJWT from "../models/userJWT"
import userDB from "../schemas/user"

const userRouter = express.Router()

userRouter.get("/userInfo", requireAuth, (req, res) => {
    const id_token = extractIDToken(req)
    const { name, picture, email }: iUserJWT = jwtDecode(id_token)
    const responseObj = { name, picture, email }
    console.log("responseObj")
    console.log(responseObj)
    return res.status(200).send(responseObj)
})

userRouter.get("/delete", requireAuth, async (req, res) => {
    const _id = idTokenToMongoID(req)
    const foundUser = await userDB.findOne({ _id })
    if (!foundUser) {
        console.log("Cannot find user with that id")
        return res
            .status(404)
            .send("The user doesn't have any data in our database yet.")
    }
    try {
        const deletedUser = await foundUser.delete()
        console.log("Sucessfully deleted user: \n", deletedUser)
        return res.status(200).send("Success!")
    } catch (err) {
        console.log("Could not internally delete user")
        console.error(err)
        return res
            .status(500)
            .send(
                "Server/Internal Issue - Unable to Delete User. Please try again later."
            )
    }
})

userRouter.get("/login", async (req, res) => {
    console.log("Verifying Code")
    // console.log(req.headers);
    try {
        //Google guidelines suggest we check and verify the header name and value
        if (req.headers["x-requested-with"] !== "XmlHttpRequest") {
            return res
                .status(400)
                .send("Invalid Login Request. Please try again.")
        }
        //We retrieve the authorization code from the request
        const code = req.query.code as string
        console.log("Code", code)
        //We use the built in Node JS OAuth2Client to get id and access token data
        console.log("Getting tokens")
        const tokensResponse = await (await client.getToken(code)).tokens
        const { id_token, access_token, refresh_token } = tokensResponse
        console.log(id_token)
        const verify = await verifyAccessToken(access_token)
        if (verify === "scopes") {
            console.log("Invalid Scopes")
            return res
                .status(403)
                .send(
                    "Unable to Login because not all permissions have been granted. Please try again by granting all permissions."
                )
        }
        if (verify === "expired" || verify === "unverifiable") {
            console.log("Expired or Unverifiable")
            return res.status(403).send("Unable to Login. Please try again.")
        }
        const userResponse: iUserJWT = jwtDecode(id_token)
        console.log("User Decoded JWT ID Token")
        console.log(userResponse)
        //We confirm that the user is veriifed by Google
        if (!userResponse.email_verified) {
            return res.status(403).send("Google account is not verified")
        }
        //We sent the ID token in a secure httpOnly cookie to the frontend
        const UTCSeconds = userResponse.exp
        const date = new Date(0)
        date.setUTCSeconds(UTCSeconds)
        console.log("Set cookie")
        //We then either update the user in the MongoDB database with updated credentials or add the user if it doesn't exist
        const id = userResponse.sub
        const foundUser = await userDB.findByIdAndUpdate(
            new ObjectId(subToObjectId(id)),
            {
                firstName: userResponse.given_name,
                lastName: userResponse.family_name,
                email: userResponse.email,
                refreshToken: cryptr.encrypt(refresh_token),
            },
            { upsert: true, new: true }
        )
        console.log("Stored user with id: " + id)
        console.log(foundUser)
        return res.status(200).send({
            id_token,
        })
    } catch (err) {
        console.log("Failed")
        console.error(err)
        return res
            .status(400)
            .send(
                "Unable to Login user. Our backend may be experiencing issues, please try again later."
            )
    }
})

export default userRouter
