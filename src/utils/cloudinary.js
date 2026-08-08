import { v2 as cloudinary } from 'cloudinary';
import { log } from 'console';
import fs from 'fs';


// Configuration
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUDNAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_SECRET 
});

const uploadToCloudinary = async (localFilePath) => {
    try {
        if(!localFilePath) return null;
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type : "auto"}
        )
        console.log("File has be uploaded successfully to Cloudinary at ", response.url);
        return response;
        
    } catch (error) {
        fs.unlinkSync(localFilePath);
        return null;
    }
}

export {uploadToCloudinary}

