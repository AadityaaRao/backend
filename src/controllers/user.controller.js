import { log } from "console";
import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js";
import {User} from "../models/user.model.js"
import {uploadToCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler( async (req, res) => {
    
    const {username, email, fullname, password} = req.body;
    
    if([username, email, fullname, password].some((field) => field?.trim() === ""))
    {
        throw new ApiError(400, "All fields are mandatory");
    }

    const existingUser = User.findOne(
        {
            $or : [{username}, {email}]
        }
    )

    if(existingUser)
    {
        throw new ApiError(409, "Username or Email already exists!");
    }
    
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    if(!avatarLocalPath)
    {
        throw new ApiError(400, "Avatar is required!")
    }

    const avatar = await uploadToCloudinary(avatarLocalPath);
    const coverImage = await uploadToCloudinary(coverImageLocalPath)

    if(!avatar)
    {
        throw new ApiError(400, "Avatar is required!")
    }

    const user = await User.create({
        username :username.toLowerCase(),
        email,
        password,
        fullname,
        avatar : avatar.url,
        coverImage : coverImage?.url || ""
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser)
    {
        throw new ApiError(500, "Something went wrong the DB insertion")
    }
    
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registered Successfully!")
    )
})

export {registerUser}