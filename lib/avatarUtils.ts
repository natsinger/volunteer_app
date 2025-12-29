import { supabase } from './supabase';

/**
 * Upload an avatar image to Supabase Storage
 * @param userId - The user's ID (used for folder organization)
 * @param file - The image file to upload
 * @returns The public URL of the uploaded image, or null if upload failed
 */
export const uploadAvatar = async (
  userId: string,
  file: File
): Promise<{ url: string | null; error?: string }> => {
  try {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      return { url: null, error: 'Please upload a valid image file (JPEG, PNG, WebP, or GIF)' };
    }

    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSize) {
      return { url: null, error: 'Image must be smaller than 2MB' };
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Error uploading avatar:', error);
      return { url: null, error: error.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(data.path);

    return { url: publicUrl };
  } catch (error: any) {
    console.error('Exception uploading avatar:', error);
    return { url: null, error: error.message || 'Failed to upload image' };
  }
};

/**
 * Delete an avatar image from Supabase Storage
 * @param avatarUrl - The full URL of the avatar to delete
 * @returns Success status
 */
export const deleteAvatar = async (
  avatarUrl: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Extract the path from the URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/avatars/userId/timestamp.ext
    const pathMatch = avatarUrl.match(/\/avatars\/(.+)$/);
    if (!pathMatch) {
      return { success: false, error: 'Invalid avatar URL' };
    }

    const filePath = pathMatch[1];

    const { error } = await supabase.storage
      .from('avatars')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting avatar:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception deleting avatar:', error);
    return { success: false, error: error.message || 'Failed to delete image' };
  }
};

/**
 * Compress and resize an image file before upload
 * @param file - The image file to process
 * @param maxWidth - Maximum width in pixels (default 400)
 * @param maxHeight - Maximum height in pixels (default 400)
 * @param quality - JPEG quality 0-1 (default 0.8)
 * @returns Compressed image file
 */
export const compressImage = (
  file: File,
  maxWidth: number = 400,
  maxHeight: number = 400,
  quality: number = 0.8
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = height * (maxWidth / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = width * (maxHeight / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
};
