import { NextApiRequest, NextApiResponse } from "next/types"
import client from "../../../../lib/backend/client"
import createPresentation from "../../../../lib/backend/functions/createPresentation"
import idTokenToMongoID from "../../../../lib/backend/functions/idTokenToMongoID"
import accessToken from "../../../../lib/backend/hooks/accessToken"
import userDB from "../../../../lib/backend/schemas/user"

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // console.log("req.body", JSON.stringify(req.body, null, 2));
    const parameters = req.body
    parameters.images = false //For early version
    parameters.sources = false //For early version
    // const accessToken = parameters.accessToken;
    const access_token = await accessToken(idTokenToMongoID(req))
    if (access_token === "invalid_scopes") {
        return res
            .status(403)
            .send(
                "Permissions Not Granted to Access Google Slides. Please logout and login again while granting all permissions."
            )
    }
    if (!access_token) {
        return res
            .status(401)
            .send(
                "Unauthorized and unable to obtain authorization credentials. Please try again later."
            )
    }
    try {
        // const client = await authorize();
        client.setCredentials({
            access_token,
        })
        const presentation = await createPresentation(
            parameters,
            client,
            parameters.slidesInfo,
            process.env.GOOGLE_SEARCH_KEY,
            process.env.CX
        )
        const _id = idTokenToMongoID(req)
        const foundUser = await userDB.findOneAndUpdate(
            { _id },
            {
                $set: {
                    slidesInHour: {
                        date: req.body.date,
                        slideCount: req.body.totalSlideCount,
                    },
                },
                $push: {
                    presentations: presentation,
                },
            },
            {
                new: true,
            }
        )
        return res.status(200).send(presentation)
    } catch (err) {
        console.error(err)
        return res.status(400).send("Unable to Create Presentation.")
    }
    // return res.status(200).send("OK")
}