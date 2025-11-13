import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../lib/supabaseClient.js';

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'email-images';

/**
 * Upload an image to Supabase Storage
 * @param {Buffer} buffer - Image buffer
 * @param {string} contentType - MIME type (e.g., 'image/png')
 * @param {string} originalName - Original filename
 * @returns {Promise<string>} Public URL of uploaded image
 */
export async function uploadImageToStorage(buffer, contentType, originalName) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  // Create date-based folder structure: YYYY-MM-DD
  const now = new Date();
  const dateFolder = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Generate unique filename: uuid-originalname.ext
  const uuid = randomUUID();
  const extension = originalName.split('.').pop() || 'png';
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${uuid}-${sanitizedName}`;
  const storagePath = `${dateFolder}/${filename}`;

  console.log(`[Storage] Uploading image to ${STORAGE_BUCKET}/${storagePath}`);

  // Upload to Supabase Storage
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('[Storage] Upload failed:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  // Get public URL
  const { data: publicUrlData } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  console.log(`[Storage] Image uploaded successfully: ${publicUrlData.publicUrl}`);
  return publicUrlData.publicUrl;
}

/**
 * Delete images older than specified days
 * @param {number} retentionDays - Number of days to keep images
 * @returns {Promise<{deletedCount: number, freedSpace: number}>}
 */
export async function cleanupOldImages(retentionDays = 60) {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffDateString = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`[Storage] Cleaning up images older than ${cutoffDateString}`);

  // List all files in the bucket
  const { data: files, error: listError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .list('', {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (listError) {
    console.error('[Storage] Failed to list files:', listError);
    throw new Error(`Failed to list files: ${listError.message}`);
  }

  // Filter folders (they look like dates: YYYY-MM-DD)
  const foldersToDelete = files
    .filter(file => file.name && file.name.match(/^\d{4}-\d{2}-\d{2}$/))
    .filter(file => file.name < cutoffDateString);

  if (foldersToDelete.length === 0) {
    console.log('[Storage] No folders to delete');
    return { deletedCount: 0, freedSpace: 0 };
  }

  console.log(`[Storage] Found ${foldersToDelete.length} folders to delete`);

  let totalDeleted = 0;
  let totalSize = 0;

  // Delete files in each folder
  for (const folder of foldersToDelete) {
    const { data: folderFiles, error: folderListError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .list(folder.name);

    if (folderListError) {
      console.error(`[Storage] Failed to list folder ${folder.name}:`, folderListError);
      continue;
    }

    if (folderFiles.length > 0) {
      // Calculate total size
      totalSize += folderFiles.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);

      // Delete all files in the folder
      const filePaths = folderFiles.map(file => `${folder.name}/${file.name}`);
      const { error: deleteError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .remove(filePaths);

      if (deleteError) {
        console.error(`[Storage] Failed to delete files in ${folder.name}:`, deleteError);
      } else {
        totalDeleted += filePaths.length;
        console.log(`[Storage] Deleted ${filePaths.length} files from ${folder.name}`);
      }
    }
  }

  const freedSpaceMB = (totalSize / (1024 * 1024)).toFixed(2);
  console.log(`[Storage] Cleanup complete: ${totalDeleted} files deleted, ${freedSpaceMB}MB freed`);

  return { deletedCount: totalDeleted, freedSpace: totalSize };
}

/**
 * Ensure storage bucket exists (for initialization)
 */
export async function ensureBucketExists() {
  if (!supabaseAdmin) {
    throw new Error('Supabase client not configured');
  }

  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

  if (listError) {
    console.error('[Storage] Failed to list buckets:', listError);
    return false;
  }

  const bucketExists = buckets.some(bucket => bucket.name === STORAGE_BUCKET);

  if (!bucketExists) {
    console.log(`[Storage] Bucket ${STORAGE_BUCKET} does not exist. Please create it manually in Supabase dashboard with public access.`);
    return false;
  }

  console.log(`[Storage] Bucket ${STORAGE_BUCKET} exists`);
  return true;
}
