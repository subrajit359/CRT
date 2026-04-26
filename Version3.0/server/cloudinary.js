import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.warn("[cloudinary] credentials missing — uploads will fail until set");
} else {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export function isConfigured() {
  return !!(cloudName && apiKey && apiSecret);
}

export async function uploadBuffer(buffer, { folder = "reasonal", resourceType = "auto", filename } = {}) {
  if (!isConfigured()) throw new Error("Cloudinary not configured");
  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, public_id: filename || undefined, use_filename: true, unique_filename: true },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function destroyAsset(publicId, resourceType = "image") {
  if (!isConfigured() || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (e) {
    console.warn("[cloudinary] destroy failed", e.message);
  }
}

export { cloudinary };
