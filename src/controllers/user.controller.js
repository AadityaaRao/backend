import { log } from "console";
import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js";
import {User} from "../models/user.model.js"
import {uploadToCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from 'jsonwebtoken'


const generateAccessAndRefreshToken = async(userId) => {
    try {

        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave : false})

        return { accessToken, refreshToken }

    } catch (error) {
        
        throw new ApiError(500, " Access and Refresh Token generation failed!")

    }
}

const registerUser = asyncHandler( async (req, res) => {
    
    const {username, email, fullname, password} = req.body;
    
    if([username, email, fullname, password].some((field) => field?.trim() === ""))
    {
        throw new ApiError(400, "All fields are mandatory");
    }

    const existingUser = await User.findOne(
        {
            $or : [{username}, {email}]
        }
    )

    if(existingUser)
    {
        throw new ApiError(409, "Username or Email already exists!");
    }
    
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

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
        throw new ApiError(500, "Something went wrong with the DB insertion")
    }
    
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registered Successfully!")
    )
})

const loginUser = asyncHandler( async(req, res) => {
    const {username, email, password} = req.body;

    if(!(username || email))
    {
        throw new ApiError(400, "Username or email is required!")
    }

    const user = await User.findOne({
        $or : [{username}, {email}]
    })

    if(!user)
    {
        throw new ApiError(404, "User does not exist!")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid)
    {
        throw new ApiError(401, "Invalid Login Credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly : true,
        secure : true
    }

    return res
    .status(200)
    .cookie("AccessToken", accessToken, options)
    .cookie("RefreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user : loggedInUser, accessToken, refreshToken
            },
            "Logged In Sucessfully!"
        )
    )
})

const logoutUser = asyncHandler( async(req,res) => {

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset : {
                refreshToken : 1
            }
        },
        {
            new : true
        }
    )

    const options = {
        httpOnly : true,
        secure : true
    }

    return res.status(200)
    .clearCookie("AccessToken", options)
    .clearCookie("RefreshToken", options)
    .json(
        new ApiResponse(200, {}, "Logged Out Successfully!")
    )
})

const refreshAccessToken = asyncHandler( async(req,res) => {
    const incomingRefreshToken = req.cookies.RefreshToken || req.body.RefreshToken

    if(!incomingRefreshToken)
    {
        throw new ApiError(401, "Unauthorized Request!")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user)
        {
            throw new ApiError(401, "Invalid Refresh Token")
        }
    
        if(incomingRefreshToken !== user.refreshToken)
        {
            throw new ApiError(401, "Refresh token is expired!")
        }
    
        const options = {
            httpOnly : true,
            secure : true
        }
    
        const {accessToken, refreshToken : newrefreshToken} = await generateAccessAndRefreshToken(user._id)
    
        return res
        .status(200)
        .cookie("AccessToken", accessToken, options)
        .cookie("RefreshToken", newrefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {accessToken, newrefreshToken},
                "Access Token refreshed!"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message)
    }
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body

    if(!fullName || !email)
    {
        throw new ApiError(400, "FullName and Email is required!")
    }

    const user = User.findByIdAndUpdate(
        req.user._id,
        {
            $set : {
                fullName : fullName,
                email : email
            }
        },
        {
            new : true
        }
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(200, {user}, "Account Details Updated Successfully!")
    )
})

const changeCurrentPassword = asyncHandler( async(req, res) => {
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user._id)

    const isPasswordCorrect = user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect)
    {
        throw new ApiError(400, "Invalid Password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res.status(200)
    .json(
        new ApiResponse(200, {}, "Password changed successfully!")
    )
})

const getCurrentUser = asyncHandler(async(req,res) => {
    const currentUser = req.user

    return res.status(200)
    .json(
        new ApiResponse(200, {currentUser}, "User details fetched successfully")
    )
})

const changeUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath)
    {
        throw new ApiError(400, "Avatar is missing")
    }

    const avatar = await uploadToCloudinary(avatarLocalPath)

    if(!avatar.url)
    {
        throw new ApiError(400, "Error while uploading avatar to cloudinary")
    }

    const user = req.user._id

    const updatedAvatar = await User.findByIdAndUpdate(
        user,
        {
            $set : {
                avatar : avatar.url
            }
        },
        {
            new : true
        }.select("-password")
    )

    return res.status(200)
    .json(
        new ApiResponse(200, {updatedAvatar}, "Avatar updated successfully")
    )
})

const changeUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath)
    {
        throw new ApiError(400, "Avatar is missing")
    }

    const coverImage = await uploadToCloudinary(coverImageLocalPath)

    if(!coverImage.url)
    {
        throw new ApiError(400, "Error while uploading Cover Image to cloudinary")
    }

    const user = req.user._id

    const updatedCoverImage = await User.findByIdAndUpdate(
        user,
        {
            $set : {
                coverImage : coverImage.url
            }
        },
        {
            new : true
        }.select("-password")
    )

    return res.status(200)
    .json(
        new ApiResponse(200, {updatedCoverImage}, "Cover Image updated successfully")
    )
})

export {registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, changeUserAvatar, changeUserCoverImage}
