import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

/**
 * Uploads a Multer memory file buffer directly to Cloudinary.
 *
 * @param {Buffer} fileBuffer - File data stored in memory by Multer.
 * @param {object} options - Cloudinary upload options such as folder/resource_type.
 * @returns {Promise<object>} Cloudinary upload result.
 */
export const uploadBufferToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!fileBuffer) {
      return reject(new Error("File buffer is required for Cloudinary upload"));
    }

    /**
     * Cloudinary upload_stream accepts file data as a stream.
     * Wrapping it in a Promise makes it easier to use with async/await.
     */
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          return reject(error);
        }

        return resolve(result);
      }
    );

    /**
     * Multer memoryStorage gives us a Buffer, but Cloudinary expects a stream.
     * streamifier converts the Buffer into a readable stream and pipes it to Cloudinary.
     */
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};