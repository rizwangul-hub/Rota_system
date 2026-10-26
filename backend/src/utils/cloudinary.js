const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY || process.env.API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET;

const isConfigured = Boolean((cloudName && apiKey && apiSecret) || process.env.CLOUDINARY_URL);

if (isConfigured) {
  if (process.env.CLOUDINARY_URL) {
    // cloudinary automatically reads CLOUDINARY_URL
  } else {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
  }
}

/**
 * Uploads a document (buffer or base64 data string) to Cloudinary.
 * If Cloudinary is not configured, securely stores the file locally in backend/uploads/documents.
 */
async function uploadDocumentToCloudinary({ buffer, base64, filename, folder = 'pixx_rota_documents' }) {
  if (isConfigured) {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true
      };

      if (base64) {
        cloudinary.uploader.upload(base64, uploadOptions, (error, result) => {
          if (error) return reject(error);
          resolve({
            fileUrl: result.secure_url || result.url,
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes
          });
        });
      } else if (buffer) {
        const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
          if (error) return reject(error);
          resolve({
            fileUrl: result.secure_url || result.url,
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes
          });
        });
        stream.end(buffer);
      } else {
        reject(new Error('Neither buffer nor base64 data provided for document upload.'));
      }
    });
  }

  // Fallback: Local file system storage
  const uploadDir = path.join(__dirname, '../../uploads/documents');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const safeName = `${Date.now()}_${(filename || 'document.pdf').replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const filePath = path.join(uploadDir, safeName);

  if (buffer) {
    fs.writeFileSync(filePath, buffer);
  } else if (base64) {
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));
  }

  const fileUrl = `/uploads/documents/${safeName}`;
  return {
    fileUrl,
    publicId: safeName,
    format: path.extname(safeName).replace('.', ''),
    bytes: fs.statSync(filePath).size
  };
}

module.exports = {
  cloudinary,
  isCloudinaryConfigured: isConfigured,
  uploadDocumentToCloudinary
};
